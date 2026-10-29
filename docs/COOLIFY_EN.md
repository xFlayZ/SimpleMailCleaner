# Deploy SimpleMailCleaner with Coolify

This guide uses small, numbered steps. You need a server running Coolify, a domain name and this GitHub project. Coolify starts four parts: the website, a background worker, the database and a one-time database setup. Only the website gets a public address.

> **Important:** SimpleMailCleaner can move real email to a provider's trash folder. Start with a test mailbox. Read [Operations and limitations](BETRIEB.md) before connecting real mailboxes.

## 1. Add the project in Coolify

1. Sign in to Coolify.
2. Open your project and environment (usually `production`).
3. Select **Add Resource → Public Repository**.
4. Enter `https://github.com/xFlayZ/SimpleMailCleaner` and choose branch `main`.
5. Choose **Docker Compose** as the build method.
6. Set the Compose file to `compose.coolify.yaml` and save.

Coolify will show services `db`, `migrate`, `web` and `worker`. The database and worker must not have public domains.

## 2. Make two secret values

On your own computer (not in the GitHub repository), open a terminal and run:

```bash
openssl rand -hex 24
openssl rand -base64 32
```

The first command creates the database password. The second creates the key that protects saved provider and AI credentials. Keep both in a password manager. Do not share them. If you lose the encryption key, saved credentials cannot be read again.

## 3. Add the variables in Coolify

Open the resource's **Environment Variables** and add these values. Replace the example with your real HTTPS domain:

```dotenv
APP_URL=https://mail.example.com
POSTGRES_PASSWORD=PASTE_THE_FIRST_SECRET_HERE
ENCRYPTION_KEY=PASTE_THE_SECOND_SECRET_HERE
REGISTRATION_OPEN=false
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
MICROSOFT_TENANT=common
PAUSE_WRITES=false
```

Mark secret values as **Secret/Is Secret** if Coolify offers that option. Leave OAuth values empty until you set up those providers. `REGISTRATION_OPEN=false` prevents additional people from registering after the first account is created.

## 4. Connect your domain to the website

1. Open service **web**, then **Domains**.
2. Add your HTTPS domain, for example `https://mail.example.com`.
3. Set the internal port to `3000`.
4. Save. Coolify can provide HTTPS after your DNS and server are configured.

The address must exactly match `APP_URL`. Do not add a domain to the database and do not expose database port 5432 publicly.

## 5. Start it

Click **Deploy**. On the first start, Coolify downloads PostgreSQL, builds the app, waits for the database, runs the database setup, then starts the website and worker. Database files stay in the Docker volume named `postgres`, including across app rebuilds.

Open `https://your-domain` and create your account. If something does not start, open **Deployment Logs** and then **Runtime Logs** in Coolify. Check `migrate` first, then `web` or `worker`.

## 6. Google and Microsoft sign-in (optional)

For Gmail and Outlook, create an OAuth app with each provider:

- Google: Create **Web application** credentials and add redirect URL `https://YOUR-DOMAIN/api/oauth/google/callback`. Put the client ID and secret in `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
- Microsoft: Register an application and add web redirect URL `https://YOUR-DOMAIN/api/oauth/outlook/callback`. Put the client ID, secret and, if needed, tenant in `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` and `MICROSOFT_TENANT`.

After changing variables in Coolify, click **Redeploy**. Providers may require an app review or admin consent. Use only the minimum permissions listed in the [provider setup guide](EINRICHTUNG.md).

T-Online and Yahoo use IMAP credentials/app passwords. Proton needs Proton Mail Bridge and the local connector; read the [provider setup guide](EINRICHTUNG.md). Never expose the Bridge or PostgreSQL to the public internet.

## 7. Set up OpenRouter

After signing in, each person adds their own OpenRouter API key under **Settings → AI & OpenRouter**. The app encrypts it and stores it for that user only. Choose a model there and review the cost estimate before a run. Do not put a shared OpenRouter key in Coolify.

## 8. Updates, backups and emergency stop

- Updates: create a PostgreSQL backup, then choose **Redeploy** in Coolify to deploy the new `main` version.
- Backups: encrypt and store PostgreSQL backups away from the server. Occasionally test restoring one.
- Encryption key: keep a safe backup of `ENCRYPTION_KEY`. Do not change it while saved credentials are encrypted with it.
- Emergency stop for new write actions: set `PAUSE_WRITES=true` and redeploy. Actions already sent to an email provider cannot be taken back.
- Removing the Coolify resource with its volume can permanently erase local data. Do not delete the `postgres` volume if you want to keep your data.

More details: [Operations and limitations](BETRIEB.md), [privacy and analysis modes](AUFRAEUMPIPELINE.md), [provider setup](EINRICHTUNG.md).
