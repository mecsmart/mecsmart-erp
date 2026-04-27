"""MongoDB client + database handle.

Every router imports `db` from here. Connection is opened lazily at module-import
time (which happens once at process start under uvicorn) and is closed by the
FastAPI shutdown event registered in `server.py`.
"""
from dotenv import load_dotenv
load_dotenv()

import os
from motor.motor_asyncio import AsyncIOMotorClient

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]
