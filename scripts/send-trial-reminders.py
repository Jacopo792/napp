#!/usr/bin/env python3
"""Send due trial reminders from a trusted scheduled job."""
import hashlib
import json
import os
import smtplib
import ssl
import sys
from datetime import datetime
from email.message import EmailMessage
from urllib.request import Request, urlopen


def rpc(endpoint, key, function, arguments):
    request = Request(
        f"{endpoint}/rest/v1/rpc/{function}",
        data=json.dumps(arguments).encode(),
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        },
    )
    with urlopen(request, timeout=15) as response:
        body = response.read()
        return json.loads(body) if body else None


def message_for(reminder, sender):
    days = reminder["days_left"]
    when = "tomorrow" if days == 1 else "in 7 days"
    end = datetime.fromisoformat(reminder["trial_ends_at"]).date().isoformat()
    identifier = "/".join(str(reminder[field]) for field in ("owner_id", "trial_ends_at", "days_left"))
    digest = hashlib.sha256(identifier.encode()).hexdigest()
    message = EmailMessage()
    message["From"] = sender
    message["To"] = reminder["email"]
    message["Subject"] = f"Your Napp Plus trial ends {when}"
    message["Message-ID"] = f"<{digest}@nappnote.com>"
    message.set_content(
        f"Your Napp Plus trial ends {when} ({end} UTC). Your account will switch to Free.\n\n"
        "Your notes and files stay in Napp. Groups and books above the Free limits "
        "remain available to read and export. Open Settings → Account to view your plan.\n"
    )
    return message


def main():
    if os.environ.get("TRIAL_REMINDERS_ENABLED") != "1":
        print("Trial reminders disabled")
        return 0
    endpoint = os.environ["SUPABASE_URL"].rstrip("/")
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    sender = os.environ["TRIAL_SMTP_FROM"]
    host = os.environ["TRIAL_SMTP_HOST"]
    port = int(os.environ.get("TRIAL_SMTP_PORT", "465"))
    username = os.environ["TRIAL_SMTP_USER"]
    password = os.environ["TRIAL_SMTP_PASSWORD"]
    failed = False
    with smtplib.SMTP_SSL(host, port, timeout=15, context=ssl.create_default_context()) as smtp:
        smtp.login(username, password)
        for reminder in rpc(endpoint, key, "claim_trial_reminders", {}):
            try:
                smtp.send_message(message_for(reminder, sender))
                rpc(endpoint, key, "complete_trial_reminder", {"reminder_lease": reminder["lease"]})
            except (OSError, ValueError) as error:
                print(f"Trial reminder failed: {type(error).__name__}", file=sys.stderr)
                failed = True
    return int(failed)


if __name__ == "__main__":
    sys.exit(main())
