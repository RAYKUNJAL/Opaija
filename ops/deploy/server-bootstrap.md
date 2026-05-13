# Opaija Server Bootstrap

Use this after SSH access to `5.78.105.83` is working.

## 1. Install runtime

```bash
sudo apt update
sudo apt install -y git curl nginx certbot python3-certbot-nginx nodejs npm
node -v
npm -v
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

Create writable runtime folders:

```bash
sudo mkdir -p /var/www/opaija/data/growth /var/www/opaija/public/voiceover /var/www/opaija/out
sudo chown -R www-data:www-data /var/www/opaija/data /var/www/opaija/public/voiceover /var/www/opaija/out
sudo chown root:www-data /var/www/opaija/.env
sudo chmod 640 /var/www/opaija/.env
```

## 4. Install service

```bash
sudo cp ops/deploy/opaija.service /etc/systemd/system/opaija.service
sudo systemctl daemon-reload
sudo systemctl enable --now opaija
sudo systemctl status opaija
```

## 5. Configure Nginx and SSL

Install an HTTP-only server block first so Certbot can create the SSL files:

```bash
sudo tee /etc/nginx/sites-available/opaija-http >/dev/null <<'NGINX'
server {
    listen 80;
    server_name opaija.com www.opaija.com;

    location / {
        proxy_pass http://127.0.0.1:8787;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
NGINX
sudo ln -sf /etc/nginx/sites-available/opaija-http /etc/nginx/sites-enabled/opaija
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d opaija.com -d www.opaija.com
```

After certificates exist, switch to the checked-in HTTPS config:

```bash
sudo cp ops/deploy/nginx-opaija.conf /etc/nginx/sites-available/opaija
sudo ln -sf /etc/nginx/sites-available/opaija /etc/nginx/sites-enabled/opaija
sudo nginx -t
sudo systemctl reload nginx
```

## 6. Verify

```bash
curl -I https://opaija.com
curl https://opaija.com/api/health
```
