# Start with a lightweight Linux Python environment
FROM python:3.10-slim

# Install Pandoc and XeLaTeX (Required for the PDF Engine)
RUN apt-get update && \
    apt-get install -y pandoc texlive-xetex texlive-fonts-recommended texlive-plain-generic && \
    rm -rf /var/lib/apt/lists/*

# Set up the working directory inside the container
WORKDIR /app

# Copy the requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy your actual microservice code
COPY main.py .

# Start the server (Render automatically assigns a PORT variable)
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}