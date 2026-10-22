import sys
import os

# Add Backend/ directory to sys.path so that imports inside Backend/main.py
# (e.g. "from routes.areas import ...") resolve correctly from the project root
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "Backend"))

from Backend.main import app  # noqa: E402

__all__ = ["app"]

