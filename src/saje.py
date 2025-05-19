from multiprocessing.queues import Queue

def worker(saje_queue: Queue, job_status_dict):
    while True:
        UUID, function, description, args, kwargs = saje_queue.get()
        job_status_dict[UUID] = {}

        print(f"[Worker] Starting job: {UUID}")
        try:
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


