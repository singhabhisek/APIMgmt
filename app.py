from flask import Flask, render_template, request, jsonify, url_for
import requests
import json
import xml.etree.ElementTree as ET

from requests import RequestException

app = Flask(__name__)

@app.route('/')
def index():
    """
    Render the index.html template with app_config.json data.
    """
    # Get the URL for app_config.json
    app_config_url = url_for('static', filename='app_config.json')
    with open(f'static/app_config.json') as f:
        app_config = json.load(f)
    return render_template('index.html', app_config=app_config)

@app.route('/execute', methods=['POST'])
def execute():
    """
    Execute the selected services based on the provided JSON configuration.
    """
    data = request.get_json()  # Parse JSON data from request
    selected_services = data.get('services', [])
    targetJson = data.get('targetJson','')
    iteration_count = int(data.get('iterationCount', 1))  # Default to 1 if not provided
    #print(data)

    # Load configuration from static.json
    if not targetJson:
        return jsonify({'status': 'error', 'message': 'No target JSON config found!'})

    with open(targetJson) as f:
        config = json.load(f)


    # Populate services list from static
    services = []
    for entry in config['entries']:
        services.append(entry['serviceName'])

    if not selected_services:
        return jsonify({'status': 'error', 'message': 'No services selected!'})

    result = {'status': 'success', 'responses': {}}
    for service in selected_services:
        service_parts = service.split(':')  # Split ServiceName:OperationName into parts
        if len(service_parts) != 2:
            return jsonify({'status': 'error', 'message': 'Invalid service format: ' + service})

        service_name, operation_name = service_parts  # Extract ServiceName and OperationName

        responses = []
        status_descriptions = []  # List to store response codes

        overall_status = 'GREEN'  # Assume GREEN initially
        passed_count = 0  # Counter for passed iterations
        raw_requests = []  # List to store raw requests
        for entry in config['entries']:
            if entry['serviceName'] == service_name and entry.get(
                    'operationName') == operation_name:  # Check both ServiceName and OperationName

                method = 'GET' if entry.get('sampleRequestLocation') == '' else 'POST'
                headers = entry.get('headers', {})
                request_executed = False
                for i in range(iteration_count):  # Perform iterations
                    try:
                        raw_request = {'method': method, 'url': entry['endpoint'], 'headers': headers}
                        if method == 'POST':
                            if entry['sampleRequestLocation'] != '':
                                with open(entry['sampleRequestLocation'], 'r') as f:
                                    sample_request_content = f.read()
                                raw_request['data'] = sample_request_content
                                raw_request['json'] = json.loads(sample_request_content)
                        raw_requests.append(raw_request)

                        if not request_executed:
                            if method == 'GET':
                                response = requests.get(entry['endpoint'], headers=headers)
                            else:
                                # Determine request content type based on sample request location file content
                                content_type = 'application/json'
                                if entry['sampleRequestLocation'] != '':
                                    with open(entry['sampleRequestLocation'], 'r') as f:
                                        sample_request_content = f.read()
                                        try:
                                            # Try parsing the content as XML
                                            ET.fromstring(sample_request_content)
                                            content_type = 'application/xml'
                                        except ET.ParseError:
                                            # If parsing as XML fails, consider it as JSON
                                            try:
                                                json.loads(sample_request_content)
                                            except ValueError:
                                                return jsonify({'status': 'error', 'message': 'Invalid sample request content!'})

                                # Send request with appropriate content type
                                if content_type == 'application/xml':
                                    response = requests.post(entry['endpoint'], headers=headers, data=sample_request_content.encode('utf-8'))
                                else:
                                    response = requests.post(entry['endpoint'], headers=headers, json=json.loads(sample_request_content))

                                request_executed = True

                        # Perform validation based on successCriteria
                        iteration_status = 'PASS' if entry['successCriteria'] in response.text else 'FAIL'
                        if iteration_status == 'PASS':
                            passed_count += 1  # Increment passed count
                        if overall_status != 'RED' and iteration_status == 'FAIL':
                            overall_status = 'AMBER'  # Update overall_status if any iteration fails
                        if overall_status != 'AMBER' and iteration_status == 'AMBER':
                            overall_status = 'AMBER'  # Update overall_status if any iteration is AMBER
                        if iteration_status == 'FAIL':
                            overall_status = 'RED'  # Update overall_status if any iteration fails

                        responses.append({'response': response.text, 'status': iteration_status})

                        # Append response code and message to status_descriptions
                        if iteration_status == 'FAIL':
                            overall_status = 'AMBER'
                            status_descriptions.append('200 - Business Exception')
                        else:
                            status_descriptions.append(f'{response.status_code} - {response.reason}')

                    except requests.exceptions.ConnectionError as e:
                        overall_status = 'RED';
                        responses.append(
                            {'response': f'Connection error occurred while accessing the service: {str(e)}', 'status': 'ERROR'})
                        status_descriptions.append('500 - Internal Server Error')
                    except RequestException as e:
                        overall_status = 'RED';
                        responses.append(
                            {'response': f'Error occurred while accessing the service: {str(e)}', 'status': 'ERROR'})
                        status_descriptions.append(f'{response.status_code} - {response.reason}')
                break

        result['responses'][service] = {
            'responses': responses,
            'passed_count': passed_count,
            'total_iterations': iteration_count,
            'overall_status': overall_status,
            'status_descriptions': status_descriptions,  # Include response codes
            'raw_requests': raw_requests  # Include raw requests
        }

    # print(result)
    return jsonify(result)

if __name__ == "__main__":
    app.run(debug=True)
