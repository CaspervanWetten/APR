import os 
from dotenv import load_dotenv


load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
CINTIQO_API_KEY = os.getenv("CINTIQO_API_KEY")
APP_ACCES_KEY = os.getenv("APP_ACCES_KEY")

DEBUG = os.getenv("DEBUG")

API_DICT = {
    "openAI" : OPENAI_API_KEY,
    "cintiqo" : CINTIQO_API_KEY,
}