# Chat attachments (Hermes Mobile)

Last verified against Hermes gateway `api_server.py` on 2026-07-06.

## Gateway contract

Hermes Mobile sends chat turns to the existing session endpoints:

- `POST /api/sessions/{session_id}/chat/stream` (primary, SSE)
- `POST /api/sessions/{session_id}/chat` (non-stream fallback)

Both accept JSON:

```json
{
  "message": "plain string OR multimodal array",
  "system_message": "optional mobile workspace prompt"
}
```

There is **no multipart upload endpoint** and **no file-id upload API**. Attachments must be inlined in `message`.

### Supported `message` shapes

| Shape | Example | Gateway support |
| --- | --- | --- |
| Plain text | `"Summarize this repo"` | Yes |
| Text + links | text body includes `[Link: https://…]` | Yes (text-only) |
| Text + documents | text body includes `[Document: notes.txt]` + file contents | Yes (text-only) |
| Text + images | OpenAI-style parts array | Yes (multimodal) |

Multimodal array (OpenAI Chat Completions vision wire format):

```json
[
  { "type": "text", "text": "What is in this screenshot?" },
  {
    "type": "image_url",
    "image_url": { "url": "data:image/jpeg;base64,..." }
  }
]
```

Gateway normalization (`_normalize_multimodal_content`) accepts:

- `text` / `input_text` parts
- `image_url` / `input_image` parts with `http(s)://` or `data:image/...;base64,...` URLs

Gateway **rejects**:

- `file` / `input_file` parts
- non-image `data:` URLs (PDF/base64 documents)
- local `file://` URIs

### Limits

| Limit | Value | Source |
| --- | --- | --- |
| Image data URL max size | 5 MB | `_MEDIA_DATA_URL_MAX_BYTES` |
| Text part max length | 64 KB | `MAX_NORMALIZED_TEXT_LENGTH` |
| Content array max items | 1000 | `MAX_CONTENT_LIST_SIZE` |

`/v1/capabilities` advertises `session_chat` and `session_chat_streaming` but does not expose a separate `multimodal` flag — capability is implied by the session chat handler accepting array `message` values.

## Mobile MVP behavior (2026-07-06)

### Composer UI

- `+` button opens attach sheet (custom modal — Android `Alert.alert` is capped at 3 buttons): **Document (PDF, Word, text)**, **Photo library**, **Take photo**, **Paste link**
- One horizontal scrollable chip row above the input (`maxHeight: 44`)
- Send enabled when text **or** at least one attachment chip is present

### Shipped attachment types

| Type | Picker | Outbound encoding | Notes |
| --- | --- | --- | --- |
| **Links** | Paste link sheet + auto-chip when URL typed/pasted | Included in text body as `[Link: url]` | URLs stripped from composer when promoted to chips |
| **Screenshots/images** | Camera + photo library (`expo-image-picker`, base64) | `image_url` data URL parts in multimodal array | Rejected client-side if encoded size > 5 MB |
| **Text documents** | `expo-document-picker` + `expo-file-system` read | Inline in text body under `[Document: name]` | Extensions: txt, md, json, code-ish types |
| **PDF documents** | `expo-document-picker` + `expo-pdf-text-extract` (native) | Inline extracted text under `[Document: name]` | Scanned/image PDFs fail with friendly error; password PDFs blocked |
| **Word (.docx)** | `expo-document-picker` + `mammoth` extract | Inline extracted text under `[Document: name]` | Legacy `.doc` not supported |

### Display

- Outbound optimistic bubbles store multimodal payloads as JSON strings; `parseMessageContent` renders text + inline images in `ChatMessageBubble`.
- Inbound gateway messages with `image_url` parts already render via the same parser.

## Files

| Area | Path |
| --- | --- |
| Composer UI + pickers | `src/components/ChatInputBar.tsx` |
| Document text extraction | `src/utils/documentContentExtractor.ts` |
| Payload builder / URL chips | `src/utils/chatAttachments.ts` |
| Send wiring | `src/screens/ChatScreen.tsx` (`sendUserText`, `handleSendMessage`) |
| Gateway clients | `src/services/hermesGatewayClient.ts`, `src/services/hermesChatClient.ts` |
| Tests | `src/__tests__/chatAttachments.test.ts`, `src/__tests__/documentContentExtractor.test.ts`, `src/__tests__/ChatInputBar.test.tsx` |

## Known gaps (honest)

1. **No binary file upload** — gateway rejects non-image file parts; PDF/DOCX are text-extracted on device and inlined.
2. **Scanned PDFs** — image-only PDFs have no embedded text; user gets a clear error (OCR not implemented).
3. **Password-protected PDFs** — not supported yet.
4. **No link unfurl / preview cards** — links are plain text context, not OpenGraph previews.
5. **No clipboard image paste** — only explicit photo/document/link pickers today.
6. **Queued sends while a run is active** serialize multimodal JSON into the text queue; attachment rehydration on drain is not implemented (text-only queue entries).
7. **Vision model requirement** — gateway accepts images, but the Mac's configured model must support vision or the turn may fail server-side.

## Verification commands

```bash
cd hermes-mobile
npm run typecheck
npm test -- --runInBand --testPathPattern='chatAttachments|documentContentExtractor|ChatInputBar' --watchman=false
```

Optional live gateway probe (requires bearer token):

```bash
curl -s -H "Authorization: Bearer $HERMES_GATEWAY_API_KEY" http://127.0.0.1:8642/v1/capabilities | jq '.features.session_chat, .endpoints.session_chat_stream'
```
