# TerraSight Deployment Guide

This guide covers deploying the TerraSight application both locally and on cloud platforms.

---

## Local Deployment

### Prerequisites

- Python 3.10+
- Node.js 18+ and npm
- Git

### 1. Clone the Repository

```bash
git clone https://github.com/ukProject111/terra.git
cd terra
```

### 2. Backend Setup

```bash
cd backend

# Create and activate a virtual environment
python -m venv venv
source venv/bin/activate        # Linux/macOS
# venv\Scripts\activate          # Windows

# Install dependencies
pip install -r requirements.txt

# Start the FastAPI server
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

The API will be available at `http://localhost:8000`. You can view the interactive docs at `http://localhost:8000/docs`.

### 3. Frontend Setup

Open a new terminal:

```bash
cd frontend

# Install dependencies
npm install

# Create .env file (if not present)
echo "VITE_API_URL=http://localhost:8000" > .env

# Start the development server
npm run dev
```

The frontend will be available at `http://localhost:5173`.

### 4. Train the Model (Optional)

If `models/model.pkl` is not present or you want to retrain:

```bash
# From the project root
pip install -r requirements.txt    # root-level deps for training
python data_pipeline.py            # process raw data
python train.py                    # train and export model
```

---

## Cloud Deployment

### Option 1: Vercel (Frontend) + Render (Backend)

This is the recommended approach for a free-tier deployment.

#### Deploy Backend on Render

1. Push the repo to GitHub (if not already done).
2. Go to [render.com](https://render.com) and create a new **Web Service**.
3. Connect your GitHub repository.
4. Configure the service:
   - **Root Directory**: `backend`
   - **Runtime**: Python
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`
5. Deploy. Note the service URL (e.g., `https://terra-backend.onrender.com`).

#### Deploy Frontend on Vercel

1. Go to [vercel.com](https://vercel.com) and import your GitHub repository.
2. Configure the project:
   - **Root Directory**: `frontend`
   - **Framework Preset**: Vite
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
3. Add an environment variable:
   - `VITE_API_URL` = your Render backend URL (e.g., `https://terra-backend.onrender.com`)
4. Deploy.

> **Note:** The `frontend/vercel.json` is already configured to handle SPA routing rewrites.

---

### Option 2: Railway (Full Stack)

Railway can host both the backend and frontend in a single project.

#### Backend

1. Go to [railway.app](https://railway.app) and create a new project from your GitHub repo.
2. Add a new service for the backend:
   - **Root Directory**: `backend`
   - **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`
3. Railway auto-detects Python and installs from `requirements.txt`.
4. Note the generated public URL.

#### Frontend

1. Add another service in the same Railway project:
   - **Root Directory**: `frontend`
   - **Build Command**: `npm run build`
   - **Start Command**: `npx serve dist -s -l $PORT`
2. Add environment variable:
   - `VITE_API_URL` = your Railway backend URL
3. Deploy.

---

### Option 3: AWS EC2 (Single Server)

For a traditional VM-based deployment.

#### 1. Launch an EC2 Instance

- AMI: Ubuntu 22.04 LTS
- Instance type: `t2.micro` (free tier) or `t2.small`
- Open ports: 22 (SSH), 80 (HTTP), 443 (HTTPS)

#### 2. SSH and Install Dependencies

```bash
ssh -i your-key.pem ubuntu@<EC2_PUBLIC_IP>

sudo apt update && sudo apt upgrade -y
sudo apt install python3 python3-pip python3-venv nodejs npm nginx -y
```

#### 3. Clone and Setup Backend

```bash
git clone https://github.com/ukProject111/terra.git
cd terra/backend

python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Run with nohup or use systemd for persistence
nohup uvicorn main:app --host 127.0.0.1 --port 8000 &
```

#### 4. Build and Serve Frontend

```bash
cd ~/terra/frontend
npm install

# Set the API URL to your server's public IP or domain
echo "VITE_API_URL=http://<EC2_PUBLIC_IP>:8000" > .env
npm run build
```

#### 5. Configure Nginx

```nginx
# /etc/nginx/sites-available/terrasight
server {
    listen 80;
    server_name <EC2_PUBLIC_IP>;

    # Frontend
    root /home/ubuntu/terra/frontend/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # API proxy
    location /api/ {
        proxy_pass http://127.0.0.1:8000/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/terrasight /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl restart nginx
```

> **Tip:** When using the Nginx proxy, set `VITE_API_URL=http://<EC2_PUBLIC_IP>/api` so all API calls route through Nginx.

---

## Environment Variables Reference

| Variable       | Location   | Description                          | Example                              |
|----------------|------------|--------------------------------------|--------------------------------------|
| `VITE_API_URL` | Frontend   | Backend API base URL                 | `http://localhost:8000`              |
| `PORT`         | Backend    | Port for uvicorn (cloud platforms)   | `8000`                               |

---

## Verifying the Deployment

After deploying, verify the following endpoints:

| Endpoint              | Expected Response                     |
|-----------------------|---------------------------------------|
| `GET /`               | `{"status": "ok"}` or welcome message |
| `GET /regions`        | List of 9 English regions             |
| `GET /indicators`     | List of 5 socioeconomic indicators    |
| `GET /docs`           | FastAPI Swagger UI                    |
| Frontend root URL     | TerraSight dashboard loads            |
