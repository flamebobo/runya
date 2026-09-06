-- M11 hardening: sealed capsule bodies are never part of the FTS projection.
UPDATE `search_documents`
SET `body` = ''
WHERE `capsule_state` = 'SEALED' AND `body` <> '';
--> statement-breakpoint
INSERT INTO `search_documents_fts`(`search_documents_fts`) VALUES ('rebuild');
