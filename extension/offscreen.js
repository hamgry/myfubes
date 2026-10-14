chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "WRITE_BACKUP_FILE") return;
  FubeBackup.writeDaily()
    .then(sendResponse)
    .catch(() => sendResponse({ ok: false, reason: "write" }));
  return true;
});
