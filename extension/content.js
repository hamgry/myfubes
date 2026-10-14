function currentChannelUrl() {
  const href = location.href;
  if (
    href.includes("/@") ||
    href.includes("/channel/") ||
    href.includes("/c/") ||
    href.includes("/user/")
  ) {
    const parts = location.pathname.split("/").filter(Boolean);
    const path = parts[0] ? `/${parts[0]}${parts[1] ? `/${parts[1]}` : ""}` : "";
    return `${location.origin}${path}`;
  }

  const owner = document.querySelector(
    "ytd-video-owner-renderer a[href], ytd-channel-name a[href], #owner a[href]",
  );
  const hrefAttr = owner?.getAttribute("href");
  if (hrefAttr) {
    return new URL(hrefAttr, location.origin).href;
  }

  return href;
}

function mountButtons() {
  if (document.getElementById("fube-bar")) return;

  const bar = document.createElement("div");
  bar.id = "fube-bar";

  const add = document.createElement("button");
  add.type = "button";
  add.textContent = "Añadir a Fube";
  add.addEventListener("click", () => {
    chrome.runtime.sendMessage({
      type: "ADD_CHANNEL",
      url: currentChannelUrl(),
    });
  });

  const open = document.createElement("button");
  open.type = "button";
  open.textContent = "Abrir Fube";
  open.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "OPEN_PANEL" });
  });

  bar.append(add, open);
  document.documentElement.appendChild(bar);
}

mountButtons();
