import os
from aiofiles import open as async_open
from sanic import Blueprint, Request
from sanic.response import text, file, redirect, html
from sanic.exceptions import NotFound
from APR import GenerateReport
from saje import SajeClient



epts = Blueprint("epts")

@epts.get("/download/<job_id>")
async def download(request: Request, job_id: str):
    file_path = f"./data/verwerkt/{job_id}"
    if os.path.exists(file_path):
        return await file(file_path, filename=f"{job_id}", mime_type="text/plain")
    return text("File not found")


@epts.get("/data/verwerkt/<job_id>")
async def download_d_v(request: Request, job_id: str):
    file_path = f"./data/verwerkt/{job_id}"
    if os.path.exists(file_path):
        return await file(file_path, filename=f"{job_id}", mime_type="text/plain")
    return text("File not found")

@epts.post("/upload/<job_id>",)
async def upload(request: Request, job_id: str, saje_client: SajeClient):
    formData = request.form
    if formData is None:
        return text("error, no form data provided", status=400)
    
    if request.files is None:
        return text("error, No file uploaded", status=400)
    file = request.files['file']
    
    with open(f"./tmp/{job_id}", "wb") as f:
        f.write(file[0].body)

    #TODO SajeClient van QoPilot porten
    saje_client.send(job_id, GenerateReport, "Generating Proces-verbaal PDF", f"./tmp/{job_id}")
    return text("uploaded")

@epts.get('/home')
async def home(request: Request):
    async with async_open("templates/home.html", mode="r") as file:
        html_content = await file.read()
    return html(html_content)

@epts.route('/APR', methods=["POST", "GET"])
async def APR(request: Request):
    async with async_open("templates/APR.html", mode="r") as file:
        html_conent = await file.read()
    return html(html_conent)

@epts.route('/APR/proto3', methods=["POST", "GET"])
async def APRproto3(request: Request):
    async with async_open("templates/proto3.html", mode="r") as file:
        html_conent = await file.read()
    return html(html_conent)

@epts.route('/APR/proto4', methods=["POST", "GET"])
async def APRproto4(request: Request):
    async with async_open("templates/proto4.html", mode="r") as file:
        html_conent = await file.read()
    return html(html_conent)

# handle missing pages
@epts.exception(NotFound)
async def handle_404(request, exception):
    return redirect('/error')

# make sure you have an /error route defined
@epts.route('/error')
async def error_page(request):
    return text("Sorry, that page doesn't exist.", status=404)