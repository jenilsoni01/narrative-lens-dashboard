# Deployment Guide (Vercel + AWS EC2 + EBS)

Recommended architecture:

- Frontend: Vercel (HTTPS)
- Backend API: AWS EC2 running Python directly (no Docker)
- Data storage: EBS mounted on EC2

## 1. Prerequisites

- AWS account
- EC2 instance (Amazon Linux 2023 or Ubuntu)
- Git and Python 3 installed on EC2
- GitHub SSH private key for auto-deploy

Use this security model:

- No IAM user for deployment
- No instance profile role required for deployment
- No SSM Agent required for deployment
- GitHub Actions connects over SSH

## 2. Prepare EC2 directories

Use these paths (or set your own and mirror them in GitHub variables):

- App repo path: `/opt/narrative-lens/app`
- Data path (EBS): `/opt/narrative-lens/data/processed`

Required files under the data path:

- `social_media.duckdb`
- `embeddings.npy`
- `faiss.index`
- `umap_coords.npy`

## 3. One-time app bootstrap on EC2

Clone your repo once on EC2:

```bash
sudo mkdir -p /opt/narrative-lens
sudo chown -R $USER:$USER /opt/narrative-lens
cd /opt/narrative-lens
git clone <YOUR_REPO_URL> app
cd app
python3 -m venv backend/.venv
source backend/.venv/bin/activate
pip install --upgrade pip
pip install -r backend/requirements.txt
```

## 4. Create systemd service

Create `/etc/systemd/system/narrative-lens-backend.service`:

```ini
[Unit]
Description=Narrative Lens Backend
After=network.target

[Service]
User=ec2-user
WorkingDirectory=/opt/narrative-lens/app/backend
EnvironmentFile=/opt/narrative-lens/app/.env
ExecStart=/opt/narrative-lens/app/backend/.venv/bin/gunicorn --bind 0.0.0.0:5000 --workers 2 wsgi:app
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

Then run:

```bash
sudo systemctl daemon-reload
sudo systemctl enable narrative-lens-backend
sudo systemctl start narrative-lens-backend
```

## 5. Configure GitHub Actions for EC2 deploy

Backend workflow: `.github/workflows/deploy-aws.yml`

It deploys by:

- Connecting over SSH
- Syncing the `backend/` folder to EC2
- Writing `.env` from GitHub secrets/variables
- Installing Python dependencies in venv
- Restarting systemd service

Required GitHub secrets:

- `EC2_SSH_PRIVATE_KEY`
- `GROQ_API`

Required GitHub variables:

- `EC2_HOST`
- `EC2_USER`
- `EC2_PORT` (optional; defaults to 22)
- `EC2_DATA_HOST_DIR` (example: `/opt/narrative-lens/data/processed`)
- `EC2_APP_DIR` (example: `/opt/narrative-lens/app`)
- `SYSTEMD_SERVICE_NAME` (example: `narrative-lens-backend`)
- `CORS_ORIGINS`

## 6. Configure Vercel frontend

- Set project root to `frontend`
- Keep `frontend/vercel.json` for SPA rewrites
- Set env var:
  - `VITE_API_BASE=https://your-api-domain-or-ip/api`

## 7. Verify deployment

- Backend health: `http://<EC2_HOST>:5000/api/health` (or domain)
- Frontend loads and calls backend
- Search/network/chat endpoints return data

## 8. Security and cost notes

- Use SSH key auth and disable password login on EC2
- Prefer no ALB for lowest cost; add ALB/TLS later when needed
- Keep EBS snapshots for backup
- Restrict inbound rules tightly
