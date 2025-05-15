#!/bin/bash

# Navigate to the directory where this script is located (optional, but good practice)
#SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
#cd "$SCRIPT_DIR"

# Check if virtual environment exists and activate it (optional, highly recommended)
# if [ -d "venv" ]; then
# source venv/bin/activate
# echo "Activated virtual environment."
# else
# echo "Virtual environment not found. Please create and activate one, then install dependencies from requirements.txt"
# fi

# Run the FastAPI application using Uvicorn
echo "Starting Xtract..."
echo "Access it at http://localhost:8000"

# The --host 0.0.0.0 makes it accessible on your network, not just localhost
# The --reload flag is useful for development, remove for production
uvicorn main:app --host 0.0.0.0 --port 8000 --reload 