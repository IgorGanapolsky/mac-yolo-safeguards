CREATE INDEX IF NOT EXISTS `audit_events_created_idx` ON `audit_events` (`created_at`);
CREATE INDEX IF NOT EXISTS `audit_events_action_created_idx` ON `audit_events` (`action`, `created_at`);
