function isYoutube(url) {
  try {
    const host = new URL(url).hostname;
    return (
      host === "www.youtube.com" ||
      host === "youtube.com" ||
      host === "m.youtube.com" ||
      host === "youtu.be"
    );
  } catch {
    return false;
  }
}

const status = document.getElementById("status");

document.getElementById("add").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url || !isYoutube(tab.url)) {
    status.textContent = "Abre un canal o video de YouTube.";
    return;
  }
  status.textContent = "Añadiendo…";
  const result = await chrome.runtime.sendMessage({
    type: "ADD_CHANNEL",
    url: tab.url,
  });
  if (result?.ok) {
    status.textContent = result.already
      ? `Ya estaba: ${result.channel.name}`
      : `Añadido: ${result.channel.name}`;
    return;
  }
  status.textContent = "No pude añadir el canal.";
});

document.getElementById("open").addEventListener("click", async () => {
  await chrome.tabs.create({ url: chrome.runtime.getURL("fube.html") });
});

document.getElementById("panel").addEventListener("click", async () => {
  const win = await chrome.windows.getCurrent();
  if (win.id != null) {
    await chrome.sidePanel.open({ windowId: win.id });
  }
  window.close();
});

document.getElementById("options").addEventListener("click", async () => {
  await chrome.runtime.openOptionsPage();
  window.close();
});
