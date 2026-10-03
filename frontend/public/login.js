// Admin / user sign-in. The dashboard itself is only served after this succeeds.
document.getElementById("f").addEventListener("submit", async (e) => {
  e.preventDefault();
  const b = document.getElementById("b"), err = document.getElementById("err");
  b.disabled = true; err.textContent = "";
  try {
    const res = await fetch("/api/login", {
      method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: document.getElementById("u").value, password: document.getElementById("p").value }),
    });
    if (res.ok) { window.location.replace("/"); return; }
    const data = await res.json().catch(() => ({}));
    err.textContent = data.detail || "Sign-in failed";
  } catch (x) {
    err.textContent = "Server not reachable — please try again in a moment";
  }
  b.disabled = false;
});
