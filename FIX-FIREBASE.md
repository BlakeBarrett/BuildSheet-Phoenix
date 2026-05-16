# How to Fix Firebase Integration

## Quick Summary

There are **two separate failure modes** for Firebase in BuildSheet:

| Layer | What fails | Root cause | Fix |
|-------|-----------|------------|-----|
| **Client (React)** | Auth, Firestore read/write | Local `.env` had stubbed/truncated keys | Copy real `.env` from server |
| **Server (Node)** | All `/api/v1/projects` calls | No Google Cloud credentials mounted in container | Provide ADC or service account key |

---

## Part 1: Fix Client-Side (React App)

### Step 1: Copy the real `.env` from your deployment server

```bash
scp blake@YOUR_DEPLOYMENT_SERVER:~/BuildSheet-Phoenix/.env ~/.src/BuildSheet-Phoenix/.env
```

The `.env` must contain real (non-truncated) values for:
- `VITE_FIREBASE_API_KEY` (exactly 39 characters, starts with `AIzaSy`)
- `VITE_FIREBASE_AUTH_DOMAIN` (e.g. `buildsheet-cloud.firebaseapp.com`)
- `VITE_FIREBASE_PROJECT_ID` (e.g. `buildsheet-cloud`)
- `VITE_FIREBASE_STORAGE_BUCKET` (e.g. `buildsheet-cloud.firebasestorage.app`)
- `VITE_FIREBASE_MESSAGING_SENDER_ID` (numeric)
- `VITE_FIREBASE_APP_ID` (41+ characters)
- `VITE_FIREBASE_MEASUREMENT_ID` (e.g. `G-5497J6K08C`)

### Step 2: Verify the keys are real (not stubbed)

```bash
cd ~/Src/blakebarrett/BuildSheet-Phoenix
. .env
echo "API key length: ${#VITE_FIREBASE_API_KEY} (should be 39)"
echo "App ID length: ${#VITE_FIREBASE_APP_ID} (should be 41+)"
echo "Measurement ID: $VITE_FIREBASE_MEASUREMENT_ID (should start with G-)"
```

### Step 3: Restart the Docker container

```bash
cd ~/Src/blakebarrett/BuildSheet-Phoenix
./shutdown-local.sh  # or docker stop buildsheet-local-run && docker rm buildsheet-local-run
./startup_local.sh
```

### Step 4: Verify the React app loads real config

Open `http://localhost:8080/app/` in your browser.

The React app reads from `env-config.js` at runtime (see `website/js/env-util.js`).
If `isFirebaseConfigured()` returns `true` and you see no console errors, the client-side is fixed.

---

## Part 2: Fix Server-Side (Firestore Access)

This is the harder problem. Server-side Firebase Admin needs **Google Cloud credentials**
to actually read/write Firestore. Without credentials, `initializeApp()` silently succeeds
but all Firestore operations fail.

### Option A: Use `gcloud` Application Default Credentials (Recommended)

This works for both local dev and any server (GCP or bare metal).

#### On your dev machine:

```bash
# 1. Authenticate with gcloud (if not already)
gcloud auth login

# 2. Create a "application default" credential file
gcloud auth application-default login

# This writes ~/.config/gcloud/application_default_credentials.json
# startup_local.sh will find it and mount it into the container.
```

#### Verify ADC is active:

```bash
# Check the credential file exists
ls -la ~/.config/gcloud/application_default_credentials.json

# Test it works (only on GCP — a local VM won't have a metadata server)
gcloud auth application-default set-quota-project buildsheet-cloud
```

### Option B: Create a dedicated Firebase Admin service account key

This is the most portable option — works anywhere, no metadata server needed.

#### 1. Create a service account in Google Cloud Console:

Go to: [IAM & Admin > Service Accounts](https://console.cloud.google.com/iam-admin/serviceaccounts)

- Click "Create Service Account" → Name: `buildsheet-firestore`
- Grant role: **Cloud Datastore User** (or `roles/datastore.user`)
- Click "Create" (no key yet)
- Click the service account → "Keys" tab → "Add Key" → "Create new key" → JSON
- Download the key file (e.g., `buildsheet-firestore-key.json`)

#### 2. Place the key file on the server:

```bash
# On the deployment server:
mkdir -p ~/.config/gcloud
scp buildsheet-firestore-key.json blake@YOUR_DEPLOYMENT_SERVER:~/.config/gcloud/application_default_credentials.json
```

Or locally (for `startup_local.sh`):

```bash
cp buildsheet-firestore-key.json ~/.config/gcloud/application_default_credentials.json
```

#### 3. Verify the key file:

```bash
# On the server (or where the key lives):
ls -la ~/.config/gcloud/application_default_credentials.json
```

The file should contain a valid JSON with `"type": "service_account"`.

### Option C: Cloud Run (production)

Cloud Run **already provides ADC automatically** — you don't need to do anything extra.
The Container automatically gets the service account's credentials via the GCP metadata server.

If Firestore access fails on Cloud Run, check:
1. The Cloud Run service account has Firestore permissions
   ```bash
   gcloud projects get-iam-policy buildsheet-cloud --flatten="bindings[].members" \
     --format="table(bindings.role)" | grep datastore
   ```
2. Your Firestore database exists and is in the same project

---

## Part 3: Full Verification Checklist

After applying fixes, run these checks:

### Client-side:
- [ ] `http://localhost:8080/env-config.js` returns real keys (39-char API key)
- [ ] Opening `http://localhost:8080/app/` shows no Firebase console errors
- [ ] `isFirebaseConfigured()` returns `true`
- [ ] User can sign in (Google, anonymous, email)

### Server-side:
- [ ] Container logs show "Using credentials file" (not just "Using ADC")
- [ ] `curl http://localhost:8080/api/v1/health` returns `{"status":"ok"}`
- [ ] Authenticated API calls (`Authorization: Bearer <idToken>`) return project lists

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `isFirebaseConfigured()` returns `false` | Missing stubbed keys in `.env` | Copy real `.env` from server (Part 1) |
| Firebase auth works, but `projects` API fails | No server-side credentials | Provide ADC (Part 2) |
| Server logs "Using Application Default Credentials (ADC)" with no subsequent error | No credentials, silently fails | Add ADC file (Part 2, Option B) |
| Firestore operations fail with "permission denied" | Service account lacks Firestore role | Add `roles/datastore.user` (Part 3) |
| `startup_local.sh` says "No ADC credentials found" | `~/.config/gcloud/` doesn't exist | Run `gcloud auth application-default login` |
