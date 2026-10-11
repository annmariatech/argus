import { useState } from "react";
import { sendSupportMessage } from "./argusApi";
import "./SupportChat.css";

export default function SupportChat({ t }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function send(event) {
    event.preventDefault();
    const text = message.trim();
    if (!text || busy) return;
    const next = [...messages, { role: "user", content: text }];
    setMessages(next); setMessage(""); setBusy(true); setError("");
    try {
      const response = await sendSupportMessage(text, messages);
      setMessages([...next, { role: "assistant", content: response.reply }]);
    } catch (err) { setError(t(err.message)); }
    finally { setBusy(false); }
  }

  return <div className="support-chat">
    {open && <section className="support-panel" aria-label={t("Argus Support Chat")}>
      <header><div><strong>{t("Argus Support")}</strong><small>{t("Scam safety and site help")}</small></div><button type="button" onClick={() => setOpen(false)} aria-label={t("Close chat")}>×</button></header>
      <div className="support-messages" aria-live="polite">
        {!messages.length && <p className="support-welcome">{t("Ask how to use Argus or about common payment scams. Never share your PIN, OTP, or password.")}</p>}
        {messages.map((item, index) => item.role === "assistant" ? <div className="chat-assistant-row" key={`${index}-${item.role}`}>
          <img className="chat-assistant-avatar" src="/argus-mascot.png" alt="" aria-hidden="true" />
          <p className="chat-message chat-assistant">{item.content}</p>
        </div> : <p className={`chat-message chat-${item.role}`} key={`${index}-${item.role}`}>{item.content}</p>)}
        {busy && <p className="support-welcome">{t("Thinking…")}</p>}
        {error && <p className="chat-error">{error}</p>}
      </div>
      <form onSubmit={send}><label className="sr-only" htmlFor="support-message">{t("Your message")}</label><input id="support-message" value={message} onChange={(event) => setMessage(event.target.value)} maxLength={2000} placeholder={t("Ask a question…")} /><button type="submit" disabled={!message.trim() || busy}>{t("Send")}</button></form>
    </section>}
    <button className="support-launcher" type="button" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? "×" : "?"}<span>{open ? t("Close chat") : t("Support")}</span></button>
  </div>;
}
