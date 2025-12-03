from sanic import Blueprint, Request, Websocket
from saje import SajeClient
from uuid import uuid4
from prompting.engine import PromptingEngine
from setup_env import API_DICT
from APR import GenerateReport, move_file, update_metadata, create_pdf_report, delete_metadata_entry, remove_file
from APRLogger import technical_log, administrative_log
import ujson
import asyncio
import os
import datetime

ws = Blueprint("ws")
engine = PromptingEngine(API_DICT, "src/prompting/templates.json")

async def handle_table_loader(ws):
    tmp_files = []
    error_files = []
    payload_data = []

    tmp_directory = "./tmp/"
    error_directory = "./tmp/error/"
    logs_directory = "./tmp/logs/"
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
    # logs_directory is optional; if missing, we just won't attach logs

    # Collect files with "done" status from metadata
    for path, data in meta_data.items():
        filename = os.path.basename(path)
        creation_date = data.get("creation_date") or data.get("created_at")
        try:
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
            **data,
        }
        payload_data.append(payload_item)

    # Collect files in /tmp/
    for entry in os.listdir(tmp_directory):
        full_path = os.path.join(tmp_directory, entry)
        if os.path.isfile(full_path):
            meta = meta_data.get(full_path, {})
            status = "log" if entry.endswith(".log") or entry.endswith(".jsonl") else "working"
            payload_data.append({
                "filename": entry,
                "status": status,
                **meta,
            })

    # Collect files in /tmp/error/
    for entry in os.listdir(error_directory):
        full_path = os.path.join(error_directory, entry)
        if os.path.isfile(full_path):
            meta = meta_data.get(full_path, {})
            payload_data.append({
                "filename": entry,
                "status": "error",
                **meta,
            })

    # -------- Parse and attach logs as separate items (one item per log file) --------
    def parse_dt(val):
        if not val:
            return None
        try:
            if isinstance(val, str) and val.endswith("Z"):
                val = val.replace("Z", "+00:00")
            return datetime.datetime.fromisoformat(val)
        except Exception:
            return None

    if os.path.isdir(logs_directory):
        for entry in sorted(os.listdir(logs_directory)):
            path = os.path.join(logs_directory, entry)
            if not os.path.isfile(path):
                continue
            if not (entry.endswith(".log") or entry.endswith(".jsonl") or entry.endswith(".txt")):
                continue

            file_logs = []
            file_log_errors = []

            try:
                with open(path, "r", encoding="utf-8", errors="replace") as f:
                    for lineno, line in enumerate(f, start=1):
                        s = line.strip()
                        if not s:
                            continue
                        try:
                            obj = ujson.loads(s)
                            if isinstance(obj, dict):
                                obj["_file"] = entry
                                obj["_line"] = lineno
                            file_logs.append(obj)
                        except Exception as e:
                            file_log_errors.append({
                                "file": entry,
                                "line": lineno,
                                "error": str(e),
                                "raw": s[:500],
                            })
            except Exception as e:
                file_log_errors.append({
                    "file": entry,
                    "line": 0,
                    "error": f"Failed to read file: {e}",
                })

            # Sort logs by datetime_utc if present
            try:
                file_logs.sort(
                    key=lambda o: (parse_dt(o.get("datetime_utc")) if isinstance(o, dict) else None)
                                  or datetime.datetime.min
                )
            except Exception:
                pass

            # Add a dedicated payload item for this log file (keeps separation)
            payload_data.append({
                "filename": entry,
                "status": "aLog" if entry.startswith("administrative") else "tLog",
                "_log_file": True,
                "logs": file_logs,
                "log_errors": file_log_errors,
            })

    # ------------------------------- Send payload -------------------------------
    if not payload_data:
        await ws.send(ujson.dumps({"response": "table-update", "data": "none"}))
    else:
        await ws.send(ujson.dumps({"response": "table-update", "data": payload_data}))

async def monitor_job(job_id: str, ws: Websocket, shared_status: dict, gebruikersID: str = None, sessieID: str = None):
    """
    Polls the SAJE job status dict and notifies the websocket on cases.
    """
    transactieID = str(uuid4())

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
                # Technical logging for done case

                await ws.send(ujson.dumps({"response": "done", "data": job.get("res")}))
                break

            case "report":
                # Technical and Administrative logging for report case
                download_link = "http://127.0.0.1:8080/" + job.get("res", "")

                await ws.send(ujson.dumps({"response": "report", "data": download_link}))
                break

            case "error":
                # Technical logging for error case
                error_message = f"error {job.get('error')} occurred, uwu try again"

                await ws.send(ujson.dumps({"response": "error", "data": error_message}))
                break

            case _:
                print("UWU")
                print(job)
                unknown_error_msg = "Unknown error occurred, please try again"

                await ws.send(ujson.dumps({"response": "error", "data": unknown_error_msg}))


@ws.websocket("/ws/<id>")
async def ws_job(request: Request, ws: Websocket, id: str, saje_client: SajeClient):
    # Generate session identifiers for logging
    gebruikersID = "TEST_GEBRUIKER"  # Using the websocket id as user identifier
    sessieID = id

    while True:
        await asyncio.sleep(1)
        data = await ws.recv()
        if data is None:
            continue

        action = ujson.loads(data).get("action")
        job_id = str(uuid4())

        match action:
            case "connection":
                # Technical logging for connection
                technical_log(
                    "ws-connection",
                    gebruikersID=gebruikersID,
                    sessieID=sessieID,
                )

                await ws.send(ujson.dumps({"response": "connected"}))
                continue

            case "heartbeat":
                # Technical logging for heartbeat
                technical_log(
                    "heartbeat",
                    gebruikersID=gebruikersID,
                    sessieID=sessieID,
                )

                await ws.send(ujson.dumps({"response": "heartbeat"}))
                continue

            case "prompt":
                await ws.send(ujson.dumps({"response": "initiated"}))
                prompt = ujson.loads(data).get("prompt", None)

                if not prompt:
                    await ws.send(ujson.dumps({"response": "error", "data": "no prompt passed"}))

                saje_client.send(job_id, engine.generate_response,
                                 "Generating engine response", "verhoren", prompt=prompt)
                # Launch background task to monitor SAJE job
                asyncio.create_task(monitor_job(
                    job_id, ws, request.app.shared_ctx.job_status, gebruikersID, sessieID))
                continue

            case "json_upload":
                await ws.send(ujson.dumps({"response": "initiated"}))
                template = ujson.loads(data).get("template", None)
                first_segment_text = ujson.loads(data).get("fileContent").get(
                    "output").get("segments")[0].get("text", None)

                if not template or not first_segment_text:
                    await ws.send(ujson.dumps({"response": "error", "data": "no template or text provided"}))

                saje_client.send(job_id, engine.generate_response,
                                 "Generating engine response", template, prompt=first_segment_text)
                # Launch background task to monitor SAJE job
                asyncio.create_task(monitor_job(
                    job_id, ws, request.app.shared_ctx.job_status, gebruikersID, sessieID))
                continue

            case "table-update":
                # Technical and Administrative logging for table-update
                technical_log(
                    "table-update",
                    gebruikersID=gebruikersID,
                    sessieID=sessieID,
                )

                await handle_table_loader(ws)
                continue

            case "Blocks":
                filename_pdf = ujson.loads(data).get("filename")
                if not filename_pdf:
                    await ws.send(ujson.dumps({"response": "error", "data": "No filename provided for Blocks action"}))
                    continue

                meta_data_path = "./data/meta_data.json"
                try:
                    with open(meta_data_path, "r", encoding="utf-8") as f:
                        meta_data = ujson.load(f)
                except (FileNotFoundError, ValueError):
                    await ws.send(ujson.dumps({"response": "error", "data": "Metadata file not found or is invalid."}))
                    continue
                
                item_metadata = meta_data.get(filename_pdf)
                if not item_metadata:
                    await ws.send(ujson.dumps({"response": "error", "data": f"No metadata found for {filename_pdf}"}))
                    continue

                original_input = item_metadata.get("original_input")
                if not original_input:
                     await ws.send(ujson.dumps({"response": "error", "data": f"No original_input found for {filename_pdf}"}))
                     continue

                json_prompt = f'''
                Analyze the following interrogation transcript.
                Your task is to extract two types of information:
                1.  A list of all proper names of individuals mentioned.
                2.  Pairs of questions asked and the verbatim answers given in response.

                Return the output as a single valid JSON object.
                The JSON object should have:
                - A key "extracted names" with a value that is a list of strings (the names).
                - For each question-answer pair you find, the question should be a key, and its value should be a list containing a single string: the verbatim answer.

                Example of final JSON structure:
                {{
                  "extracted names": ["John Doe", "Officer Smith"],
                  "What is your full name?": ["My name is John Doe."],
                  "Where were you on the night of October 31st?": ["I was at a friend's party."]
                }}

                Here is the text to analyze:
                ---
                {original_input}
                ---

                Your response should be ONLY the JSON object. Do not include any other text or explanations.
                '''
                
                try:
                    response_str = engine.generate_response("verhoor-vragen-gpt-4o", prompt=json_prompt)
                    # Clean the response to get only the JSON
                    response_str = response_str.strip()
                    if response_str.startswith("```json"):
                        response_str = response_str[7:]
                    if response_str.endswith("```"):
                        response_str = response_str[:-3]
                    response_str = response_str.strip()
                    
                    response_data = ujson.loads(response_str)
                except Exception as e:
                    print(f"Failed to get or parse structured data from LLM: {e}")
                    response_data = {
                        "extracted names": [], 
                        "responses to shown item 1": [], 
                        "gestelde vragen": [f"Error: Could not process text. Details: {e}"] 
                    }

                await ws.send(ujson.dumps({"response": "word-interface-data", "data": response_data}))
                continue

            case "pv-individual-retry":
                # Administrative logging for pv-individual-retry

                file = ujson.loads(data).get("file", None)
                move_file(f"./tmp/error/{file}", "./tmp/")
                saje_client.send(file, GenerateReport,
                                 "Updating MetaData.json", f"./tmp/{file}")
                continue

            case "update-pv-information":
                # Administrative logging for update-pv-information
                updated_data = ujson.loads(data)['currentData']
                administrative_log(
                    "update-pv-information",
                    gebruikersID=gebruikersID,
                    sessieID=sessieID,
                    updated_data=updated_data,
                )

                if not updated_data:
                    continue

                update_metadata(updated_data)
                continue

            case "generateReport":
                # Administrative logging for generateReport
                ID = ujson.loads(data).get("ID", None)
                administrative_log(
                    "generateReport",
                    gebruikersID=gebruikersID,
                    sessieID=sessieID,
                    fileId=ID
                )

                saje_client.send(
                    ID, create_pdf_report, "creating pdf after generate_report websocket send", ID)
                asyncio.create_task(monitor_job(
                    ID, ws, request.app.shared_ctx.job_status, gebruikersID, sessieID))
                continue

            case "cancel-task":
                # Administrative logging for cancel-task
                ID = ujson.loads(data).get("filename", None)
                administrative_log(
                    "cancel-task",
                    gebruikersID=gebruikersID,
                    sessieID=sessieID,
                    fileID=ID
                )

                remove_file(f"./tmp/{ID}")
                saje_client.send(ID, delete_metadata_entry,
                                 "deleting metadata entry of cancelled task", ID)
                continue

            case "delete-pv":
                # Administrative logging for delete-pv
                ID = ujson.loads(data).get("filename", None)

                administrative_log(
                    "delete-pv",
                    gebruikersID=gebruikersID,
                    sessieID=sessieID,
                    fileId=ID
                )

                delete_metadata_entry(ID)
                continue

            case "delete-unfinished-pv":
                ID = ujson.loads(data).get("filename", None)

                administrative_log(
                    "delete-unfinished-pv",
                    gebruikersID=gebruikersID,
                    sessieID=sessieID,
                    fileId=ID
                )

                remove_file(f"./tmp/error/{ID}")
                continue

            case "update-and-generate-pdf":
                update_data = ujson.loads(data).get("data")
                if not update_data:
                    await ws.send(ujson.dumps({"response": "error", "data": "No data provided"}))
                    continue
                
                file_id = update_data.get("ID")
                if not file_id:
                    await ws.send(ujson.dumps({"response": "error", "data": "No ID provided in update data"}))
                    continue

                # 1. Update metadata
                try:
                    update_metadata(update_data)
                    administrative_log(
                        "update-pv-information",
                        gebruikersID=gebruikersID,
                        sessieID=sessieID,
                        updated_data=update_data,
                    )
                except Exception as e:
                    await ws.send(ujson.dumps({"response": "error", "data": f"Failed to update metadata: {e}"}))
                    continue

                # 2. Generate PDF
                administrative_log(
                    "generateReport",
                    gebruikersID=gebruikersID,
                    sessieID=sessieID,
                    fileId=file_id
                )
                saje_client.send(
                    file_id, create_pdf_report, "Creating PDF after metadata update", file_id)
                asyncio.create_task(monitor_job(
                    file_id, ws, request.app.shared_ctx.job_status, gebruikersID, sessieID))
                continue

            case _:
                technical_log(
                    "unknow communication",
                    gebruikersID=gebruikersID,
                    sessieID=sessieID,
                    params=data
                )
                print(f"unknown communication: {data}")

                await ws.send(ujson.dumps({"response": "error", "data": "Unexpected communication"}))
                continue
