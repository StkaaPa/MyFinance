import os
import psycopg

from psycopg.rows import dict_row
from dotenv import load_dotenv

load_dotenv()

def ligar_database():
    return psycopg.connect(
        dbname="myfinance",
        user="postgres",
        password=os.environ["DB_PASSWORD"],
        host="localhost",
        port=5432,
        row_factory=dict_row,
    )