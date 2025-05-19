from prompting.engine import PromptingEngine
from jinja2 import Environment, FileSystemLoader, select_autoescape
from playwright.sync_api import sync_playwright
from setup_env import API_DICT, DEBUG
import re
import os
import shutil



env = Environment(
    loader=FileSystemLoader("templates"),  
    autoescape=select_autoescape(['html', 'xml'])
)


def GenerateReport(file):
    try:
        information = extractInformation(file)
        parsed_html = buildHtml(information)
        pdf_path = html_to_pdf(parsed_html, file)
    except Exception as e:
        if DEBUG:
            print(f"[GenerateReport] Exception occured:\n{e}")
        move_file(file)
    finally:
        remove_file(file)
    return pdf_path


def move_file(file, dest_dir="./tmp/error"):
    """Moves passed file to the /tmp/error folder"""
    os.makedirs(dest_dir, exist_ok=True)
    filename = os.path.basename(file)
    dest_path = os.path.join(dest_dir, filename)
    if os.path.exists(file):
        shutil.move(file, dest_path)
    else:
        raise FileNotFoundError(f"No such file: {file}")
    # if DEBUG:
    #     print("moved file")



def remove_file(file):
    """Function to remove the file after processing"""
    if os.path.exists(file):
        os.remove(file)
    else:
        raise FileNotFoundError

def html_to_pdf(html_string, file):
    file_name = os.path.basename(file) 
    output_pdf_path = os.path.join('./data/verwerkt', f"{file_name}.pdf")
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.set_content(html_string)
        page.pdf(path=output_pdf_path, format='A4', print_background=True)
        browser.close()

    return output_pdf_path


def extractInformation(file):
    engine = PromptingEngine(API_DICT, "src/prompting/templates.json")
    with open (file, 'r') as f:
        verhoor = f.read()
    datum_prompt = "Wat is de datum van het verhoor? Geef alleen de datum in de vorm van [dag]-[maand]-[jaar]" + "\n\n\nVerhoor:\n" + verhoor 
    tijd_prompt = "Hoe laat was het verhoor? Geef alleen de exacte tijd zoals die in de gegeven text staat"+ "\n\n\nVerhoor:\n" + verhoor 
    varblisanten_prompt = "Wie zijn de verbalisanten in het verhoor? Geef je reactie als [titel1]: [naam1] --- [titel2]: [naam2]" + "\n\n\nVerhoor:\n" + verhoor 
    locatie_prompt = "Waar was het verhoor?" + "\n\n\nVerhoor:\n" + verhoor 
    verdachte_prompt = "Hoe identificeerde verdachte zich? geef alleen de exacte naan" + "\n\n\nVerhoor:\n" + verhoor 
    geboortedag_prompt = "Wat is de geboortedatum van de verdachte? Geen alleen de datum in de vorm van [dag]-[maand]-[jaar]" + "\n\n\nVerhoor:\n" + verhoor 
    geboortestad_prompt = "What is de geboortestad van de verdachte? Geef alleen de stad" + "\n\n\nVerhoor:\n" + verhoor 
    woonadres_prompt = "Wat is het woonadres van de verdachte? Geef enkel straatnaam en het nummer" + "\n\n\nVerhoor:\n" + verhoor 
    woonstad_prompt = "Wat is de woonstad van de verdachte? Geef enkel de stad" + "\n\n\nVerhoor:\n" + verhoor 

    datum = engine.generate_response("verhoor-vragen-gpt-4o", prompt=datum_prompt)
    tijd = engine.generate_response("verhoor-vragen-gpt-4o", prompt=tijd_prompt)
    verbalisanten = engine.generate_response("verhoor-vragen-gpt-4o", prompt=varblisanten_prompt)
    locatie = engine.generate_response("verhoor-vragen-gpt-4o", prompt=locatie_prompt)
    verdachte = engine.generate_response("verhoor-vragen-gpt-4o", prompt=verdachte_prompt)
    geboortedag = engine.generate_response("verhoor-vragen-gpt-4o", prompt=geboortedag_prompt)
    geboortestad = engine.generate_response("verhoor-vragen-gpt-4o", prompt=geboortestad_prompt)
    woonadres = engine.generate_response("verhoor-vragen-gpt-4o", prompt=woonadres_prompt)
    woonstad = engine.generate_response("verhoor-vragen-gpt-4o", prompt=woonstad_prompt)
    proces_verbaal = engine.generate_response("verhoor-samenvatting-gpt-4o", prompt=verhoor)    

    return datum, tijd, verbalisanten, locatie, verdachte, geboortedag, geboortestad, woonadres, woonstad, proces_verbaal

def buildHtml(information):
    datum, tijd, verbalisanten, locatie, verdachte, geboortedag, geboortestad, woonadres, woonstad, proces_verbaal = information
    
    image_path = "../static/media/PolitieLogoFullTransparant.png"
    pattern = r"\[titel1\]:\s*(.*[a-zA-Z])\s{0,3}---\s{0,3}\[titel2\]:\s*(.*)"
    matches = re.findall(pattern, verbalisanten)
    verbalisanten = matches[0]
    template = env.get_template("pvtemplate.html")
    rendered_html = template.render(
        DATUM=datum,
        TIJD=tijd,
        VERBALISANTEN=verbalisanten,
        LOCATIE=locatie,
        VERDACHTE=verdachte,
        GEBOORTEDAG=geboortedag,
        GEBOORTESTAD=geboortestad,
        WOONADRES=woonadres,
        WOONSTAD=woonstad,
        VERKLARING=proces_verbaal,
        IMG_PATH=image_path
    )
    return rendered_html




if __name__ == "__main__":
    move_file("./tmp/test.txt")

    # res = GenerateReport("./tmp/6d1bdf07-caf5-4785-9f6e-d51f6f57d6e7")





