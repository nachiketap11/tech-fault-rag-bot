import { useState } from "react";
import { API_BASE_URL, fetchJson } from "../lib/api.js";

export function AuthScreen({ onSuccess }) {
  const [authMode, setAuthMode] = useState("login");
  const [authForm, setAuthForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!authForm.email.trim() || !authForm.password) {
      setError("Email and password are required.");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      const data = await fetchJson(`${API_BASE_URL}/auth/${authMode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: authForm.email, password: authForm.password }),
      });
      onSuccess(data.access_token, data.user);
      setAuthForm({ email: "", password: "" });
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Something went wrong during authentication.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="app-shell auth-shell">
      <section className="auth-card">
        <p className="eyebrow">Multi-User Access</p>
        <h1>Tech Fault RAG Bot</h1>
        <p className="auth-copy">
          Sign in to keep your conversations private and separate from other users.
        </p>

        <div className="auth-toggle">
          <button
            className={authMode === "login" ? "auth-tab active" : "auth-tab"}
            onClick={() => setAuthMode("login")}
            type="button"
          >
            Log in
          </button>
          <button
            className={authMode === "signup" ? "auth-tab active" : "auth-tab"}
            onClick={() => setAuthMode("signup")}
            type="button"
          >
            Sign up
          </button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="field-label" htmlFor="email">Email</label>
          <input
            id="email"
            className="title-input"
            type="email"
            value={authForm.email}
            onChange={(e) => setAuthForm((f) => ({ ...f, email: e.target.value }))}
          />

          <label className="field-label" htmlFor="password">Password</label>
          <input
            id="password"
            className="title-input"
            type="password"
            value={authForm.password}
            onChange={(e) => setAuthForm((f) => ({ ...f, password: e.target.value }))}
          />

          {error ? <p className="error-banner">{error}</p> : null}

          <button className="submit-button auth-submit" disabled={isSubmitting} type="submit">
            {isSubmitting
              ? authMode === "login" ? "Logging in..." : "Creating account..."
              : authMode === "login" ? "Log in" : "Create account"}
          </button>
        </form>
      </section>
    </div>
  );
}
