from multiprocessing.queues import Queue
from time import sleep

def worker(saje_queue: Queue, job_status_dict):
    while True:
        UUID, function, description, args, kwargs = saje_queue.get()
        job_status_dict[UUID] = {"status" : "ongoing"}

        try:

            match function.__name__:
                case "create_pdf_report":
                    print(f"[Worker] Generating PDF report for job: {UUID}")
                    res = function(*args, **kwargs)
                    job_status_dict[UUID] = {"status": "report", "res": res}

                # case "generate_response":
                    
                
                case "delete_metadata_entry":
                    print(f"[Worker] Deleting metadata for job: {UUID}")
                    max_retries = 3
                    attempts = 0
                    success = False

                    while attempts < max_retries:
                        try:
                            res = function(*args, **kwargs)
                            job_status_dict[UUID] = {"status": "deleted", "res": res}
                            success = True
                            break
                        except Exception as e:
                            attempts += 1
                            print(f"[Worker] Attempt {attempts} failed for delete_metadata_entry (UUID: {UUID}): {e}")
                            sleep(.5)
                            if attempts < max_retries:
                                print("[Worker] Retrying...")
                    
                    if not success:
                        raise Exception(f"delete_metadata_entry failed after {max_retries} attempts.")


                case _:    
                    print(f"[Worker] Starting job: {UUID}")
                    res = function(*args, **kwargs)
                    job_status_dict[UUID] = {"status" : "done", "res" : res}

            print(f"[Worker] Finished job: {UUID}") 
      
        except Exception as e:
            job_status_dict[UUID] = {"status" : "error"}
            print(f"[Worker] Error in job {UUID} -> function {function.__name__} -> description {description}: {e}")


class SajeClient:
    def __init__(self, queue: Queue) -> None:
        self.queue = queue
    
    def send(self, UUID: str, function: callable, description: str, *args, **kwargs) -> None:
        print(f"[Worker] Received job: {UUID} -> function {function.__name__} -> {description}")
        self.queue.put_nowait((UUID, function, description, args, kwargs))


