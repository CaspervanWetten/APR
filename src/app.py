# Custom imports
from blueprints.endpoints import epts
from blueprints.websocket import ws
from saje import SajeClient, worker

# Libraries
import os
import typing
from sanic import Sanic
from sanic.request import Request
from sanic.response import html, redirect, text
from sanic_ext import Extend
from multiprocessing import Manager
from setup_env import APP_ACCES_KEY



# Maak de app aan
app = Sanic("apr_draft_3")
app.static('/static', './static')
app.blueprint(epts)
app.blueprint(ws)
Extend(app)

@app.main_process_start
async def start(app: Sanic):
    manager = Manager()
    app.shared_ctx.saje_queue = manager.Queue()
    app.shared_ctx.job_status = manager.dict()
    

@app.main_process_ready
async def ready(app: Sanic):
    app.manager.manage(
        "SajeWorker", worker, {
            "saje_queue": app.shared_ctx.saje_queue,
            "job_status_dict": app.shared_ctx.job_status
        },
    )

@app.before_server_start
async def setup_saje(app: Sanic):
    app.ext.dependency(SajeClient(app.shared_ctx.saje_queue))




@app.middleware('request', attach_to="request") # Can also attach to response
async def check_auth(request: Request):
    if request.path.startswith("/ws"):
        return  # Allow WebSocket connections without auth check
    
    open_paths = ['/authorize', '/static']  # alleen /static/ (css/js) en /authorize zijn toegankelijk zonder auth 
    ##                                             A SECURITY RISK ^^
    if any(request.path.startswith(p) for p in open_paths):
        return # Authorized

    key_from_cookie = request.cookies.get("auth")
    if APP_ACCES_KEY in (key_from_cookie, ):
        return  # Authorized

    return text("Unauthorized", status=401)


# Definieer redirects (huidig redirect '/' alleen naar /route_circulair)
def get_static_function(value: typing.Any) -> typing.Callable[..., typing.Any]:
    return lambda *_, **__: value

REDIRECTS = {
    '/': '/APR'
}

for src, dst in REDIRECTS.items():
    app.add_route(get_static_function(redirect(dst)), src)



# Authorization endpoint
@app.route("/authorize", methods=["GET", "POST"])
async def authorize(request: Request):
    if request.method == "POST":
        submitted_key = request.form.get("key")
        if submitted_key == APP_ACCES_KEY:
            resp = redirect("/APR")
            resp.add_cookie(
                 "auth",
                APP_ACCES_KEY,
                path="/",
                httponly=True,
                secure=False,  # Set to True if you're using HTTPS
                samesite="Lax"
            )
            return resp
        return text("Invalid key", status=401)

    html_form = """
    <!DOCTYPE html>
    <html>
    <head><title>Authorize</title></head>
    <body>
        <h2>Enter Access Key</h2>
        <form method="POST">
            <input type="password" name="key" placeholder="Secret Key"/>
            <button type="submit">Submit</button>
        </form>
    </body>
    </html>
    """
    return html(html_form)



# Run app
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8080, dev=True) # For linux
    # app.run(host='127.0.0.1', port=8000, debug=True, auto_reload=True)  # For windows/linux
    # app.run(host='127.0.0.1', port=8000, fast=True) # For production




    
