/* eslint-env browser */

// UI elements
const basePath = window.location.pathname.replace(/\/$/, "");
const loginBtn = document.getElementById("loginBtn");
const authStatusEl = document.getElementById("authStatus");
const twofaSection = document.getElementById("twofaSection");
const submit2faBtn = document.getElementById("submit2faBtn");
const loginStatus = document.getElementById("loginStatus");
const accountSelect = document.getElementById("accountSelect");
const saveBtn = document.getElementById("saveBtn");
const syncBtn = document.getElementById("syncBtn");
const statusEl = document.getElementById("status");

let mapping = [];
// track whether we've shown the 2FA input to user
let hasPrompted2fa = false;

/** Poll budget readiness then load data */
async function init() {
  // Poll budget-status until ready, updating badge text
  const badgeEl = document.getElementById("budgetStatus");
  let ready = false;
  while (!ready) {
    try {
      const res = await fetch(`${basePath}/api/budget-status`);
      const json = await res.json();
      ready = json.ready;
    } catch {
      /* ignore errors */
    }
    badgeEl.textContent = ready ? "Budget downloaded" : "Budget downloading";
    if (!ready) {
      // wait before retrying
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  // Once ready, fetch mapping and account data
  await loadData();
}

/** Load mapping and account options, update UI based on Legal & General login state */
async function loadData() {
  let res;
  try {
    res = await fetch(`${basePath}/api/data`);
  } catch (err) {
    console.error("Failed to fetch /api/data", err);
    return;
  }
  const { mapping: map, accounts, landg } = await res.json();
  mapping = map;
  // Populate account dropdown
  accountSelect.innerHTML =
    '<option value="">-- none --</option>' +
    accounts
      .map(
        (a) =>
          `<option value="${a.id}"${mapping[0]?.accountId === a.id ? " selected" : ""}>${a.name}</option>`,
      )
      .join("");
  // Update login UI: only show errors or 2FA prompt, not 'Logged in'
  if (landg.status === "awaiting-2fa") {
    twofaSection.style.display = "block";
  } else if (landg.status === "error") {
    loginStatus.textContent = "Error: " + landg.error;
  }
}

// Trigger Legal & General login flow
loginBtn.onclick = async () => {
  authStatusEl.textContent = "Authenticating...";
  twofaSection.style.display = "none";
  hasPrompted2fa = false;
  await fetch(`${basePath}/api/landg/login`, { method: "POST" });
  pollStatus();
};

// Submit 2FA code
submit2faBtn.onclick = async () => {
  const code = document.getElementById("twofaCode").value;
  await fetch(`${basePath}/api/landg/2fa`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  // hide 2FA entry and clear any prompt after submission
  twofaSection.style.display = "none";
  loginStatus.textContent = "";
  pollStatus();
};

// Poll login status until logged-in or error
async function pollStatus() {
  const { status } = await (await fetch(`${basePath}/api/landg/status`)).json();
  if (status === "awaiting-2fa") {
    if (!hasPrompted2fa) {
      twofaSection.style.display = "block";
      hasPrompted2fa = true;
    }
    authStatusEl.textContent = "";
    setTimeout(pollStatus, 1000);
    return;
  }
  if (status === "logged-in") {
    authStatusEl.textContent = "Successful";
    await loadData();
    return;
  }
  if (status === "error") {
    authStatusEl.textContent = "Unsuccessful";
    return;
  }
  // still pending (idle or other): retry polling
  setTimeout(pollStatus, 1000);
}

// Save mapping
saveBtn.onclick = async () => {
  statusEl.textContent = "Saving mapping...";
  const newMap = [
    {
      accountId: accountSelect.value,
      lastBalance: mapping[0]?.lastBalance || 0,
    },
  ];
  const res = await fetch(`${basePath}/api/mappings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(newMap),
  });
  if (res.ok) {
    statusEl.textContent = "Mapping saved.";
  } else {
    statusEl.textContent = "Error saving mapping";
  }
};

// Sync now
syncBtn.onclick = async () => {
  syncBtn.disabled = true;
  statusEl.textContent = "Syncing...";
  try {
    const res = await fetch(`${basePath}/api/sync`, { method: "POST" });
    const { count } = await res.json();
    statusEl.textContent = `Synced ${count} transaction(s)`;
  } catch (err) {
    statusEl.textContent = "Error syncing: " + err.message;
  } finally {
    syncBtn.disabled = false;
  }
};

// Initialize on load
document.addEventListener("DOMContentLoaded", init);
