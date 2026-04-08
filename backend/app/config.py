import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
PROJECT_ROOT = BASE_DIR.parent

load_dotenv(PROJECT_ROOT / ".env")


class Config:
    GROQ_API = os.getenv("GROQ_API", "")
    GROQ_BASE_URL = "https://api.groq.com/openai/v1"
    DEFAULT_LLM_MODEL = "llama-3.3-70b-versatile"
    CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")

    DATA_PROCESSED_DIR = Path(os.getenv("DATA_PROCESSED_DIR", str(PROJECT_ROOT / "data" / "processed")))
    DB_PATH = DATA_PROCESSED_DIR / "social_media.duckdb"
    EMBEDDINGS_PATH = DATA_PROCESSED_DIR / "embeddings.npy"
    FAISS_INDEX_PATH = DATA_PROCESSED_DIR / "faiss.index"
    UMAP_COORDS_PATH = DATA_PROCESSED_DIR / "umap_coords.npy"
    CLUSTERS_PATH = DATA_PROCESSED_DIR / "clusters.pkl"

    MAX_QUERY_ROWS = 10000
    MAX_EMBED_ROWS = 50000
    MAX_NETWORK_NODES = 150
