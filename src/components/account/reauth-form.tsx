"use client";

import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  ApiError,
  type SecondFactor,
  reauthenticate,
  reauthenticateWithCode,
  reauthenticateWithPasskey,
  requestReauthCode,
} from "@/lib/api";
import { useI18n } from "@/lib/i18n";

const fieldClass =
  "mt-1.5 h-9 w-full rounded-lg border border-border bg-background px-3 text-[13px] text-foreground outline-none focus:border-ring";

export function ReauthForm({ onReady, busy }: { onReady: () => void; busy?: boolean }) {
  const { t } = useI18n();
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [totpCode, setTotpCode] = useState("");
  // Set once the API says this account's step-up needs more than the password or emailed code.
  const [secondFactor, setSecondFactor] = useState<SecondFactor | null>(null);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function prove(event: FormEvent) {
    event.preventDefault();
    setError("");
    setPending(true);
    const second = secondFactor === "totp" ? totpCode.trim() : undefined;
    try {
      if (code.length === 6) await reauthenticateWithCode(code, second);
      else await reauthenticate(password, second);
      onReady();
    } catch (err) {
      if (err instanceof ApiError && err.secondFactor) {
        setSecondFactor(err.secondFactor);
        setError("");
      } else {
        setError(err instanceof ApiError ? err.message : t("common.apiError"));
      }
    } finally {
      setPending(false);
    }
  }

  async function sendCode() {
    setError("");
    setPending(true);
    try {
      await requestReauthCode();
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("common.apiError"));
    } finally {
      setPending(false);
    }
  }

  async function confirmWithPasskey() {
    setError("");
    setPending(true);
    try {
      await reauthenticateWithPasskey();
      onReady();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError(t("profile.passkeyUnsupported"));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={prove} className="mt-4 rounded-lg border border-border p-3">
      <p className="text-[13px] text-muted-foreground">{t("profile.reauthBody")}</p>
      <label className="mt-3 block text-[12px] text-muted-foreground">
        {t("profile.currentPassword")}
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className={fieldClass}
        />
      </label>
      {sent ? (
        <label className="mt-3 block text-[12px] text-muted-foreground">
          {t("profile.reauthCode")}
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            maxLength={6}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
            className={fieldClass}
          />
        </label>
      ) : null}
      {secondFactor === "totp" ? (
        <>
          <p className="mt-3 text-[13px] text-muted-foreground">{t("profile.reauthTotpBody")}</p>
          <label className="mt-3 block text-[12px] text-muted-foreground">
            {t("profile.reauthTotpCode")}
            <input
              autoComplete="one-time-code"
              value={totpCode}
              maxLength={64}
              onChange={(event) => setTotpCode(event.target.value)}
              className={fieldClass}
            />
          </label>
        </>
      ) : null}
      {secondFactor === "passkey" ? (
        <p role="status" className="mt-3 text-[13px] text-muted-foreground">{t("profile.reauthPasskeyBody")}</p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="submit"
          disabled={
            pending ||
            busy ||
            (!password && code.length !== 6) ||
            secondFactor === "passkey" ||
            (secondFactor === "totp" && !totpCode.trim())
          }
        >
          {t("login.confirmTitle")}
        </Button>
        <Button type="button" variant="outline" disabled={pending || busy} onClick={() => void sendCode()}>
          {t("profile.reauthSend")}
        </Button>
        <Button type="button" variant="outline" disabled={pending || busy} onClick={() => void confirmWithPasskey()}>
          {t("login.usePasskey")}
        </Button>
      </div>
      {error ? <p role="alert" className="mt-3 text-[13px] text-destructive">{error}</p> : null}
    </form>
  );
}
