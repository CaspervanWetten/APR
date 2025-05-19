from sanic import Blueprint, Request, Websocket
from saje import SajeClient
from uuid import uuid4
from prompting.engine import PromptingEngine
from setup_env import API_DICT
from APR import GenerateReport, move_file
import ujson
import asyncio
import os
import datetime



ws = Blueprint("ws")
engine = PromptingEngine(API_DICT, "src/prompting/templates.json")

import os
import datetime
import ujson

async def handle_pv_update(ws):
    pdf_files = []
    tmp_files = []
    error_files = []
    payload_data = []
    directory = "./data/verwerkt/"
    tmp_directory = "./tmp/"
    error_directory = "./tmp/error/"
    
    # Ensure the directories exist
    if not os.path.isdir(directory):
        raise ValueError(f"'{directory}' is not a directory or does not exist.")
    if not os.path.isdir(tmp_directory):
        raise ValueError(f"'{tmp_directory}' is not a directory or does not exist.")
    if not os.path.isdir(error_directory):
        raise ValueError(f"'{error_directory}' is not a directory or does not exist.")

    for entry in os.listdir(directory):
        if entry.lower().endswith('.pdf'):
            full_path = os.path.join(directory, entry)
            try:
                # Get the creation time (on Unix this reflects metadata change)
                ctime = os.path.getctime(full_path)
                creation_date = datetime.datetime.fromtimestamp(ctime)
            except Exception as e:
                # In case of any issue getting ctime, skip the file or log the error
                print(f"Warning: Could not get creation date for {entry}: {e}")
                continue
            pdf_files.append((entry, creation_date))
    
    # Collect files from the tmp directory with "working" status
    for entry in os.listdir(tmp_directory):
        full_path = os.path.join(tmp_directory, entry)
        if os.path.isfile(full_path):
            tmp_files.append((entry, "working"))

    # Collect files from the tmp/error directory with "error" status
    for entry in os.listdir(error_directory):
        full_path = os.path.join(error_directory, entry)
        if os.path.isfile(full_path):
            error_files.append((entry, "error"))

    # Send the response via WebSocket
    if not pdf_files and not tmp_files and not error_files:
        await ws.send(ujson.dumps({"response": "pv-update", "data": "none"}))
    else:
        # Extend the payload data 
        payload_data.extend(
            {"filename": filename, "status" : "done", "creation_date": creation_date.isoformat()}
            for filename, creation_date in pdf_files
        )
        payload_data.extend(
            {"filename": filename, "status": status}
            for filename, status in tmp_files
        )
        payload_data.extend(
            {"filename":filename, "status": status}
             for filename, status in error_files
        )
        
        # Send the full payload
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
                saje_client.send(file, GenerateReport, "Generating Proces-verbaal PDF", f"./tmp/{file}")
                continue

            case _:
                print(data)
                await ws.send(ujson.dumps({"response": "error", "data" : "Unexpected communication"}))
                continue
                