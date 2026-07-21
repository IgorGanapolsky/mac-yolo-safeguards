-- Host-side macOS computer-use dispatcher for tinker-yolo.
--
-- The model never executes Lua directly. Python writes a private JSON request,
-- then invokes this fixed module through Hammerspoon's IPC bridge. Hammerspoon
-- already owns the macOS Accessibility and Screen Recording grants on the
-- Hermes fleet, so the dispatcher works from both an interactive shell and SSH.

local M = {}

local ACTIONABLE_ROLES = {
  AXButton = true,
  AXCheckBox = true,
  AXComboBox = true,
  AXLink = true,
  AXMenuButton = true,
  AXMenuItem = true,
  AXPopUpButton = true,
  AXRadioButton = true,
  AXSearchField = true,
  AXSecureTextField = true,
  AXSlider = true,
  AXStaticText = true,
  AXTab = true,
  AXTextArea = true,
  AXTextField = true,
}

local function attribute(element, name)
  if not element then return nil end
  local ok, value = pcall(function() return element:attributeValue(name) end)
  if ok then return value end
  return nil
end

local function trim(value, maximum)
  if type(value) ~= 'string' then return nil end
  value = value:gsub('%s+', ' ')
  if #value > maximum then return value:sub(1, maximum) .. '…' end
  return value
end

local function plain_frame(value)
  if type(value) ~= 'table' then return nil end
  local x = tonumber(value.x)
  local y = tonumber(value.y)
  local w = tonumber(value.w)
  local h = tonumber(value.h)
  if not x or not y or not w or not h then return nil end
  return { x = x, y = y, w = w, h = h, centerX = x + w / 2, centerY = y + h / 2 }
end

local function element_metadata(element, identifier)
  local role = attribute(element, 'AXRole')
  local secure = role == 'AXSecureTextField'
  local value = secure and '[secure]' or trim(attribute(element, 'AXValue'), 240)
  return {
    id = identifier,
    role = role,
    subrole = attribute(element, 'AXSubrole'),
    title = trim(attribute(element, 'AXTitle'), 240),
    description = trim(attribute(element, 'AXDescription'), 240),
    identifier = trim(attribute(element, 'AXIdentifier'), 160),
    value = value,
    enabled = attribute(element, 'AXEnabled'),
    focused = attribute(element, 'AXFocused'),
    secure = secure,
    frame = plain_frame(attribute(element, 'AXFrame')),
  }
end

local function front_context(maximum)
  maximum = math.max(1, math.min(tonumber(maximum) or 160, 300))
  local app = hs.application.frontmostApplication()
  local app_element = app and hs.axuielement.applicationElement(app) or nil
  local focused_window = attribute(app_element, 'AXFocusedWindow')
  local focused_element = attribute(app_element, 'AXFocusedUIElement')
  local elements = {}
  local references = {}
  local seen = {}

  local function walk(element, depth)
    if not element or depth > 9 or #elements >= maximum or seen[element] then return end
    seen[element] = true
    local metadata = element_metadata(element, nil)
    local has_text = metadata.title or metadata.description or metadata.value
    if ACTIONABLE_ROLES[metadata.role] and (has_text or metadata.frame) then
      metadata.id = 'ax-' .. tostring(#elements + 1)
      table.insert(elements, metadata)
      references[metadata.id] = element
    end
    local children = attribute(element, 'AXChildren') or {}
    for _, child in ipairs(children) do
      walk(child, depth + 1)
      if #elements >= maximum then break end
    end
  end

  if focused_window then walk(focused_window, 0) end
  return {
    app = app and { name = app:name(), bundleId = app:bundleID(), pid = app:pid() } or nil,
    window = focused_window and element_metadata(focused_window, nil) or nil,
    focusedElement = focused_element and element_metadata(focused_element, nil) or nil,
    elements = elements,
  }, references
end

local function screen_inventory()
  local result = {}
  for index, screen in ipairs(hs.screen.allScreens()) do
    local frame = screen:fullFrame()
    table.insert(result, {
      index = index,
      name = screen:name(),
      uuid = screen:getUUID(),
      frame = plain_frame(frame),
    })
  end
  return result
end

local function state(maximum)
  local context = front_context(maximum)
  local mouse = hs.mouse.absolutePosition()
  context.accessibility = hs.accessibilityState()
  context.secureInput = hs.eventtap.isSecureInputEnabled()
  context.screenLocked = context.app and (
    context.app.bundleId == 'com.apple.loginwindow' or context.app.name == 'loginwindow'
  ) or false
  context.mouse = { x = mouse.x, y = mouse.y }
  context.screens = screen_inventory()
  context.generatedAt = os.date('!%Y-%m-%dT%H:%M:%SZ')
  return context
end

local function inspect_target(request)
  if request.target then
    local _, references = front_context(request.max_elements)
    local element = references[tostring(request.target)]
    if not element then error('accessibility target is stale or missing: ' .. tostring(request.target)) end
    return element_metadata(element, tostring(request.target)), element
  end
  local x = tonumber(request.x)
  local y = tonumber(request.y)
  if not x or not y then error('x and y are required when target is omitted') end
  local element = hs.axuielement.systemElementAtPosition(x, y)
  return element and element_metadata(element, nil) or { frame = { x = x, y = y, w = 0, h = 0 } }, element
end

local function click(request)
  local metadata, element = inspect_target(request)
  local point
  if request.target and element then
    local pressed = false
    local ok, result = pcall(function() return element:performAction('AXPress') end)
    pressed = ok and result ~= false
    if pressed then return { method = 'AXPress', target = metadata } end
    local frame = metadata.frame
    if not frame then error('target has no clickable frame') end
    point = { x = frame.centerX, y = frame.centerY }
  else
    point = { x = assert(tonumber(request.x)), y = assert(tonumber(request.y)) }
  end
  local button = tostring(request.button or 'left')
  local count = math.max(1, math.min(tonumber(request.count) or 1, 3))
  for _ = 1, count do
    if button == 'right' then hs.eventtap.rightClick(point) else hs.eventtap.leftClick(point) end
    hs.timer.usleep(80000)
  end
  return { method = button .. 'Click', count = count, target = metadata }
end

local function activate_app(request)
  local name = tostring(request.name or '')
  if name == '' then error('application name or bundle id is required') end
  local expected = name:lower()
  local function matches(app)
    if not app then return false end
    return (app:name() or ''):lower() == expected or (app:bundleID() or ''):lower() == expected
  end
  local function running_match()
    for _, candidate in ipairs(hs.application.runningApplications()) do
      if matches(candidate) then return candidate end
    end
    return nil
  end
  local ok
  if name:find('%.') then
    ok = hs.application.launchOrFocusByBundleID(name)
  else
    ok = hs.application.launchOrFocus(name)
  end
  if not ok then error('application could not be launched or focused: ' .. name) end
  for attempt = 1, 40 do
    local frontmost = hs.application.frontmostApplication()
    if matches(frontmost) then
      return { activated = name, bundleId = frontmost:bundleID(), pid = frontmost:pid() }
    end
    if attempt % 5 == 0 then
      local candidate = running_match()
      if candidate then
        candidate:unhide()
        candidate:activate(true)
      end
    end
    hs.timer.usleep(50000)
  end
  error('application launched but did not become frontmost: ' .. name)
end

local function capture(request)
  local path = tostring(request.path or '')
  if path == '' then error('screenshot path is required') end
  local screen = hs.screen.mainScreen()
  if not screen then error('no main screen is available') end
  local image = screen:snapshot()
  if not image then error('screen capture failed; grant Screen Recording to Hammerspoon') end
  local size = image:size()
  local ok = image:saveToFile(path)
  if not ok then error('screen capture could not be saved') end
  return { path = path, width = size.w, height = size.h }
end

local function dispatch(request)
  local action = tostring(request.action or 'state')
  if action == 'state' then return state(request.max_elements) end
  if action == 'inspect_target' then
    local metadata = inspect_target(request)
    return { target = metadata, state = state(request.max_elements) }
  end

  local before = state(20)
  if before.screenLocked and action ~= 'screenshot' then
    error('screen is locked; unlock the local GUI session before computer actions')
  end

  local result
  if action == 'activate_app' then
    result = activate_app(request)
  elseif action == 'click' then
    result = click(request)
  elseif action == 'type' then
    local text = tostring(request.text or '')
    if text == '' then error('text is required') end
    hs.eventtap.keyStrokes(text)
    result = { typedCharacters = #text }
  elseif action == 'key' then
    local key = tostring(request.key or '')
    if key == '' then error('key is required') end
    hs.eventtap.keyStroke(request.modifiers or {}, key, tonumber(request.delay_us) or 20000)
    result = { key = key, modifiers = request.modifiers or {} }
  elseif action == 'scroll' then
    local dx = tonumber(request.dx) or 0
    local dy = tonumber(request.dy) or 0
    hs.eventtap.scrollWheel({ dy, dx }, request.modifiers or {}, 'pixel')
    result = { dx = dx, dy = dy }
  elseif action == 'screenshot' then
    result = capture(request)
  else
    error('unknown computer action: ' .. action)
  end

  hs.timer.usleep(math.max(50000, math.min(tonumber(request.settle_us) or 250000, 2000000)))
  result.state = state(request.max_elements)
  return result
end

function M.run(request_path)
  local ok, result = xpcall(function()
    local handle = assert(io.open(request_path, 'r'))
    local content = handle:read('*a')
    handle:close()
    local request = assert(hs.json.decode(content))
    return { ok = true, result = dispatch(request) }
  end, function(message) return tostring(message) end)
  if not ok then return hs.json.encode({ ok = false, error = result }) end
  return hs.json.encode(result)
end

return M
