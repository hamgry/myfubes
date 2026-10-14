const DEFAULT_APP_URL = "http://localhost:3000";

const input = document.getElementById("appUrl");
const status = document.getElementById("status");
const enabled = document.getElementById("backupEnabled");
const folderName = document.getElementById("folderName");
const backupStatus = document.getElementById("backupStatus");

function formatWhen(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("es", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function setBackupStatus(text, warn = false) {
  backupStatus.textContent = text;
  backupStatus.classList.toggle("warn", warn);
}

async function refreshBackupUi() {
  const settings = await chrome.storage.local.get([
    "backupEnabled",
    "backupFolderName",
    "lastBackupAt",
    "backupNeedsPermission",
  ]);
  enabled.checked = Boolean(settings.backupEnabled);
  folderName.textContent = settings.backupFolderName
    ? `Carpeta: ${settings.backupFolderName}`
    : "Sin carpeta.";
  if (settings.backupNeedsPermission) {
    setBackupStatus("Chrome pidió permiso otra vez. Pulsa Guardar ahora.", true);
    return;
  }
  if (settings.lastBackupAt) {
    setBackupStatus(`Último backup: ${formatWhen(settings.lastBackupAt)}`);
    return;
  }
  setBackupStatus("");
}

async function pickFolder() {
  const handle = await window.showDirectoryPicker({
    id: "fube-backup",
    mode: "readwrite",
    startIn: "documents",
  });
  await FubeBackup.saveHandle(handle);
  await chrome.storage.local.set({
    backupFolderName: handle.name,
    backupNeedsPermission: false,
  });
  const result = await FubeBackup.writeDaily();
  await applyWriteResult(result);
}

async function applyWriteResult(result) {
  if (result?.ok) {
    await chrome.storage.local.set({
      lastBackupAt: result.savedAt,
      lastBackupDay: new Date(result.savedAt).toLocaleDateString("en-CA"),
      backupNeedsPermission: false,
    });
    await chrome.runtime.sendMessage({ type: "BACKUP_WRITTEN" });
    await refreshBackupUi();
    return;
  }
  if (result?.reason === "permission") {
    await chrome.storage.local.set({ backupNeedsPermission: true });
  }
  const messages = {
    "no-folder": "Elegí una carpeta primero.",
    permission: "Chrome bloqueó la carpeta. Volvé a elegirla.",
    write: "No pude escribir el archivo.",
  };
  setBackupStatus(messages[result?.reason] || "No pude guardar.", true);
}

enabled.addEventListener("change", async () => {
  const backupEnabled = enabled.checked;
  if (backupEnabled) {
    const handle = await FubeBackup.loadHandle();
    if (!handle) {
      enabled.checked = false;
      setBackupStatus("Elegí una carpeta primero.", true);
      return;
    }
  }
  await chrome.storage.local.set({ backupEnabled });
  await chrome.runtime.sendMessage({
    type: "BACKUP_ALARM_SYNC",
    enabled: backupEnabled,
  });
  if (backupEnabled) {
    const result = await FubeBackup.writeDaily();
    await applyWriteResult(result);
    return;
  }
  await refreshBackupUi();
});

document.getElementById("pickFolder").addEventListener("click", async () => {
  try {
    await pickFolder();
  } catch (error) {
    if (error?.name === "AbortError") return;
    setBackupStatus("No pude elegir la carpeta.", true);
  }
});

document.getElementById("backupNow").addEventListener("click", async () => {
  const result = await FubeBackup.writeDaily();
  await applyWriteResult(result);
});

document.getElementById("restoreFolder").addEventListener("click", async () => {
  try {
    const result = await FubeBackup.restoreFromHandle();
    if (!result.ok) {
      await applyWriteResult(result);
      return;
    }
    setBackupStatus(`Restaurados ${result.count} canales.`);
  } catch {
    setBackupStatus("No encontré fube-favoritos.json.", true);
  }
});

document.getElementById("restoreFile").addEventListener("click", async () => {
  const picker = document.createElement("input");
  picker.type = "file";
  picker.accept = "application/json,.json";
  picker.addEventListener("change", async () => {
    const file = picker.files?.[0];
    if (!file) return;
    try {
      const result = await FubeBackup.restoreFromFile(file);
      setBackupStatus(`Restaurados ${result.count} canales.`);
    } catch {
      setBackupStatus("Archivo inválido.", true);
    }
  });
  picker.click();
});

chrome.storage.sync.get({ appUrl: DEFAULT_APP_URL }, (result) => {
  input.value = result.appUrl || DEFAULT_APP_URL;
});

document.getElementById("save").addEventListener("click", () => {
  const appUrl = input.value.trim() || DEFAULT_APP_URL;
  chrome.storage.sync.set({ appUrl }, () => {
    status.textContent = "Guardado.";
  });
});

refreshBackupUi();
