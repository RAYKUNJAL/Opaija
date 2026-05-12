# Opaija Server Bootstrap

Use this after SSH access to `5.78.105.83` is working.

## 1. Install runtime

```bash
sudo apt update
sudo apt install -y git nginx certbot python3-certbot-nginx nodejs npm
```

## 2. Put app on server

```bash
sudo mkdir -p /var/www/opaija
sudo chown -R "$USER":"$USER" /var/www/opaija
cd /var/www/opaija
git clone https://github.com/RAYKUNJAL/Opaija.git .
npm ci
npm run build
```

If the GitHub repo is not current, copy this workspace to `/var/www/opaija` with `scp` or `rsync`, then run `npm ci && npm run build`.

## 3. Add production secrets

Create `/var/www/opaija/.env`:

```bash
PORT=8787
PUBLIC_SITE_URL=https://opaija.com
VIDEO_PROVIDER=mock
VOICE_PROVIDER=mock
OPENAI_API_KEY=
FAL_KEY=
ELEVENLABS_API_KEY=
RESEND_API_KEY=
RESEND_AUDIENCE_ID=
RESEND_FROM_EMAIL=Opaija <founders@opaija.com>
```

## 4. Install service

```bash
sudo cp ops/deploy/opaija.service /etc/systemd/system/opaija.service
sudo systemctl daemon-reload
sudo systemctl enable --now opaija
sudo systemctl status opaija
```

## 5. Configure Nginx and SSL

```bash
sudo cp ops/deploy/nginx-opaija.conf /etc/nginx/sites-available/opaija
sudo ln -sf /etc/nginx/sites-available/opaija /etc/nginx/sites-enabled/opaija
sudo nginx -t
sudo certbot --nginx -d opaija.com -d www.opaija.com
sudo systemctl reload nginx
```

## 6. Verify

```bash
curl -I https://opaija.com
curl https://opaija.com/api/health
```
