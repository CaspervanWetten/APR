from sanic import Blueprint, Request, Websocket
from saje import SajeClient
from uuid import uuid4
from prompting.engine import PromptingEngine
from setup_env import API_DICT
from APR import GenerateReport, move_file, update_metadata, create_pdf_report
import ujson
import asyncio
import os
import datetime



ws = Blueprint("ws")
engine = PromptingEngine(API_DICT, "src/prompting/templates.json")

async def handle_pv_update(ws):
    tmp_files = []
    error_files = []
    payload_data = []

    tmp_directory = "./tmp/"
    error_directory = "./tmp/error/"
    meta_data_path = "./data/meta_data.json"

    # Load metadata JSON
    try:
        with open(meta_data_path, "r", encoding="utf-8") as f:
            meta_data = ujson.load(f)
    except FileNotFoundError:
        print(f"Warning: meta_data.json not found at {meta_data_path}")
        meta_data = {}
    except Exception as e:
        print(f"Error loading meta_data.json: {e}")
        meta_data = {}

    # Ensure directories exist
    if not os.path.isdir(tmp_directory):
        raise ValueError(f"'{tmp_directory}' is not a directory or does not exist.")
    if not os.path.isdir(error_directory):
        raise ValueError(f"'{error_directory}' is not a directory or does not exist.")

    # Collect files with "done" status from metadata
    for path, data in meta_data.items():
        filename = os.path.basename(path)
        creation_date = data.get("creation_date") or data.get("created_at")
        try:
            # Normalize to ISO format if needed
            if isinstance(creation_date, str):
                creation_date = datetime.datetime.fromisoformat(creation_date).isoformat()
            elif isinstance(creation_date, datetime.datetime):
                creation_date = creation_date.isoformat()
            else:
                creation_date = datetime.datetime.now().isoformat()
        except Exception:
            creation_date = datetime.datetime.now().isoformat()

        payload_item = {
            "filename": filename,
            "status": "done",
            "creation_date": creation_date,
            **data
        }
        payload_data.append(payload_item)

    # Collect working and error files
    for entry in os.listdir(tmp_directory):
        full_path = os.path.join(tmp_directory, entry)
        if os.path.isfile(full_path):
            meta = meta_data.get(full_path, {})
            payload_data.append({
                "filename": entry,
                "status": "working",
                **meta
            })

    for entry in os.listdir(error_directory):
        full_path = os.path.join(error_directory, entry)
        if os.path.isfile(full_path):
            meta = meta_data.get(full_path, {})
            payload_data.append({
                "filename": entry,
                "status": "error",
                **meta
            })

    # Send payload
    if not payload_data:
        await ws.send(ujson.dumps({"response": "pv-update", "data": "none"}))
    else:
        await ws.send(ujson.dumps({"response": "pv-update", "data": payload_data}))

async def monitor_job(job_id: str, ws: Websocket, shared_status: dict):
    """
    Polls the SAJE job status dict and notifies the websocket on cases.
    """
    while True:
        await asyncio.sleep(0.2)
        job = shared_status.get(job_id, {})
        status = job.get("status")
        match status:
            case "queued":
                continue

            case "ongoing":
                continue

            case "update":
                await ws.send(ujson.dumps({"response": "update", "data": job.get("update")}))
        
            case "done":
                await ws.send(ujson.dumps({"response": "done", "data": job.get("res")}))
                break

            case "error":
                await ws.send(ujson.dumps({"response": "error", "data": f"error {job.get("error")} occurred, please try again"}))
                break
            
            case _: 
                await ws.send(ujson.dumps({"response": "error", "data": "Unknown error occurred, please try again"}))




@ws.websocket("/ws/<id>")
async def ws_job(request: Request, ws: Websocket, id: str, saje_client: SajeClient):
    while True:
        await asyncio.sleep(1)
        data = await ws.recv()
        if data is None:
            continue 
        
        action = ujson.loads(data).get("action")
        job_id = str(uuid4())
        match action:
            case "connection":
                await ws.send(ujson.dumps({"response": "connected"}))
                continue

            case "heartbeat":
                await ws.send(ujson.dumps({"response" : "heartbeat"}))
                continue

            case "prompt":
                await ws.send(ujson.dumps({"response": "initiated"}))
                prompt = ujson.loads(data).get("prompt", None)

                if not prompt:
                    await ws.send(ujson.dumps({"response": "error", "data" : "no prompt passed"}))

                saje_client.send(job_id, engine.generate_response, "Generating engine response", "verhoren", prompt=prompt)
                # Launch background task to monitor SAJE job 
                asyncio.create_task(monitor_job(job_id, ws, request.app.shared_ctx.job_status))
                continue

            case "json_upload":
                await ws.send(ujson.dumps({"response" : "initiated"}))
                template = ujson.loads(data).get("template", None)
                first_segment_text = ujson.loads(data).get("fileContent").get("output").get("segments")[0].get("text", None)

                if not template or not first_segment_text:
                    await ws.send(ujson.dumps({"response": "error", "data" : "no template or text provided"}))
                    
                saje_client.send(job_id, engine.generate_response, "Generating engine response", template, prompt=first_segment_text)
                # Launch background task to monitor SAJE job 
                asyncio.create_task(monitor_job(job_id, ws, request.app.shared_ctx.job_status))
                continue
                
            case "pv-update":
                await handle_pv_update(ws)
                continue

            case "pv-individual-retry":
                file = ujson.loads(data).get("file", None)
                move_file(f"./tmp/error/{file}", "./tmp/")
                saje_client.send(file, GenerateReport, "Updating MetaData.json", f"./tmp/{file}")
                continue

            case "update-pv-information":
                updated_data = ujson.loads(data).get("updatedData")
                update_metadata(updated_data)
                continue

            case "generateReport":
                ID = ujson.loads(data).get("ID", None)
                saje_client.send(ID, create_pdf_report, "Generating Proces-verbaal PDF", ID)
                continue

            case _:
                print(data)
                await ws.send(ujson.dumps({"response": "error", "data" : "Unexpected communication"}))
                continue
                