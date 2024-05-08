var selectedApp = '';
var targetJson = '';

// Function to show confirmation box
function showConfirmation(message, type) {
    var confirmBox = $('#confirm-box');
    var confirmHeader = confirmBox.find('#confirm-header-text');
    var confirmMessage = confirmBox.find('.confirm-message');
    var okButton = confirmBox.find('#ok-button');

    confirmMessage.text(message);
    confirmBox.removeClass('hidden');

    if (type === 'success') {
        confirmHeader.text('Success');
    } else if (type === 'error') {
        confirmHeader.text('Error');
    }

    // Hide confirmation box when OK button is clicked
    okButton.click(function() {
        hideConfirmation();
    });

    confirmBox.click(function() {
        hideConfirmation();
    });
}

// Function to hide confirmation box
function hideConfirmation() {
    var confirmBox = $('#confirm-box');
    var okButton = confirmBox.find('#ok-button');

    confirmBox.addClass('hidden');

    // Remove click event from OK button
    okButton.off('click');
}

$(document).ready(function() {
    var table = $('#service-table').DataTable({
        drawCallback: function(settings) {
            // Hide the last two columns on each page draw
            $(this.api().table().container())
                .find('tbody tr')
                .find('td:nth-last-child(-n+2)')
                .hide();
        },
        autoWidth: false,
        order: [], // Disable initial sorting
        columnDefs: [
            { targets: [0, 3, 4, 6], orderable: false } // Disable sorting for the first column (Select All checkbox)
        ],
        select: true
    });

    // Event handler for "Select All" checkbox
    $('#select-all').change(function() {
        var isChecked = $(this).prop('checked');
        $('#service-table').DataTable().rows().every(function() {
            var rowNode = this.node();
            var checkbox = $(rowNode).find('input[name="service"]');
            checkbox.prop('checked', isChecked);
        });
    });

    // Event handler for individual checkboxes
    $(document).on('change', 'input[name="service"]', function() {
        var currentPageCheckedCount = 0;
        $('#service-table').DataTable().rows().every(function() {
            var rowNode = this.node();
            var checkbox = $(rowNode).find('input[name="service"]');
            if (checkbox.prop('checked')) {
                currentPageCheckedCount++;
            }
        });
//        console.log('Total checked checkboxes in the table:', currentPageCheckedCount);

        var totalCheckboxCount = $('#service-table').DataTable().rows().count();
//        console.log('Total checkboxes in the table:', totalCheckboxCount);

        var allChecked = currentPageCheckedCount === totalCheckboxCount;
        $('#select-all').prop('checked', allChecked);
    });

    // Event handler for application select change
    $('#app-dropdown').change(function() {
        table.clear().draw();
        $('#select-all').prop('checked', false);
        selectedApp = $(this).find('option:selected').text();
        $('#passed-count-value').text('');
        $('#failed-at-least-once-count-value').text('');
        $('#failed-all-count-value').text('');
        $.getJSON('/static/config/app_config.json', function(data) {
            targetJson = '';
            data.applications.forEach(function(app) {
                if (app.name === selectedApp) {
                    targetJson = app.file;
                    return false;
                }
            });
            $.getJSON(targetJson, function(serviceData) {
                $.each(serviceData.entries, function(index, entry) {
                    var overallStatus = entry.overall_status;
                    var passedCount = entry.passed_count;
                    var totalCount = entry.total_iterations;
                    var iterationStatusText = passedCount + ' / ' + totalCount;
                    table.row.add([
                        '<input type="checkbox" name="service" value="' + entry.serviceName + ':' + entry.operationName + '">',
                        entry.serviceName,
                        entry.operationName,
                        '',
                        '',
                        entry.useCase,
                        '<button type="button" style="display:none" class="btn btn-primary show-results-btn">Results</button>',
                        '',
                        ''
                    ]);
                });
                table.draw();
            }).fail(function(jqXHR, textStatus, errorThrown) {
                console.error('Error fetching JSON file:', textStatus, errorThrown);
            });
        });
    });

    // Submit button Logic
    $('#submit-btn').click(function() {
        clearTableAndAccordion();

        var selectedServices = getSelectedServices();
//        alert(selectedServices);
        if (selectedServices.length === 0) {
            showConfirmation('Please select at least one service to execute.', 'error');
            return;
        }

        executeServices(selectedServices);
    });

    // Clear table body and accordion contents
    function clearTableAndAccordion() {
        $('.accordion').empty();
        $('.accordion').remove();
        $('.modal').remove();
        $('.status-icon').attr('src', '').removeAttr('title');
        $('.status-icon').next('span').remove();
        $('td:nth-child(7)').empty();
        $('td:nth-child(8)').empty();
        $('td:nth-child(4)').empty();
        $('td:nth-child(5)').empty();
        $('#passed-count-value, #failed-at-least-once-count-value, #failed-all-count-value').text('');
    }

    // Get selected services from the DataTable
    function getSelectedServices() {
        var selectedServices = [];
        $('#service-table').DataTable().rows().every(function() {
            var rowData = this.data();
            var checkbox = $(this.node()).find('input[type="checkbox"]');
            if (checkbox.prop('checked')) {
                selectedServices.push(rowData[1] + ':' + rowData[2]);
            }
        });
        return selectedServices;
    }

    // Execute selected services
    async function executeServices(selectedServices) {
        $('#loader-overlay').show();

        var iterationCount = $('#iteration-count').val();
        var requestData = {
            services: selectedServices,
            targetJson: targetJson,
            iterationCount: iterationCount
        };

        var serviceBatches = [];
        var batchCount = 5;
        while (requestData.services.length > 0) {
            serviceBatches.push(requestData.services.splice(0, batchCount));
        }

        try {
              for (let i = 0; i < serviceBatches.length; i++) {
                    console.log('Executing Batch ' + (i + 1) + ' of ' + serviceBatches.length + ':', serviceBatches[i].join(', '));
                    await Promise.all(serviceBatches[i].map(service => executeService(service, requestData)));

                    // Check if this is the last batch
                    if (i === serviceBatches.length - 1) {
                        // Hide loader and show confirmation message after the last batch
                        $('#loader-overlay').hide();
                        showConfirmation('Execution Completed', 'success');
                    }
                }
        } catch (error) {
            handleExecutionError(null, null, error);

        } finally {
            $('#loader-overlay').hide();
        }
    }

    // Function to execute a single service
    function executeService(service, requestData) {
//        alert(service);
        return new Promise((resolve, reject) => {
            $.ajax({
                url: '/execute',
                type: 'POST',
                contentType: 'application/json',
                data: JSON.stringify({
                    ...requestData,
                    services: [service]
                }),
                success: function(response) {
                    handleExecutionSuccess(response);
                    resolve();
                },
//                error: function(xhr, status, error) {
//                    reject(error + "(" + service + ")");
//                }
                error: function(xhr, status, error) {
                    // Extract the error message from the response if available
                    let errorMessage = '';
                    if (xhr.responseJSON && xhr.responseJSON.message) {
                        errorMessage = xhr.responseJSON.message;
                    } else {
                        errorMessage = error || 'Unknown error occurred';
                    }

                    // Log the error message
                    //console.error('Error:', errorMessage);

                    // Reject the promise with the error message
//                    reject(errorMessage);
                    // Extract serviceName and operationName from the error message
                    serviceName = errorMessage.split(' => ')[0].split(' - ')[0]
                    operationName = errorMessage.split(' => ')[0].split(' - ')[1]
                    errorDetail = errorMessage.split(' => ')[1]
//                    console.log(serviceName);
//                    console.log(operationName);
//                    console.log(errorDetail);
                    // Pass serviceName, operationName, and errorDetail to displayErrorInDataTable
                    displayErrorInDataTable(serviceName.trim(), operationName.trim(), errorDetail.trim());

                    // Resolve the promise even if there's an error to continue with other operations
                    resolve();
                }
            });
        });
    }

    // Function to display the error message in the status description cell of the datatable
function displayErrorInDataTable(serviceName, operationName, errorMessage) {

    var dataTable = $('#service-table').DataTable();

    // Find the row in the datatable corresponding to the service name and operation name
    var rowIndex = -1;
    dataTable.rows().every(function (index) {
        var rowData = this.data();
//        console.log(rowData[1] + rowData[2])
        if (rowData && rowData[1] === serviceName && rowData[2] === operationName) {
            rowIndex = index;
            return false; // Exit the loop once the row is found
        }
        return true; // Continue iterating over rows
    });

    // Check if the row was found
    if (rowIndex !== -1) {
        // Update the status description cell with the error message
        // Here, you would typically update the cell using the library's API for updating row data
        // For example, assuming you have a column index for the status description cell:
        var statusDescriptionColumnIndex = 4; // Assuming the status description is in the third column
                dataTable.cell(rowIndex, statusDescriptionColumnIndex).data(`<span style="color: red">${errorMessage}</span>`).draw();

    } else {
        console.error('Row not found in the datatable:', serviceName, operationName);
    }
}

    // Handle successful execution response
    function handleExecutionSuccess(response) {
        var counts = calculateCounts(response.responses);
        updateTableRows(response.responses);
        updateCountsDisplay(counts);
        updateShowResultsButtons(response)
//        hideLoaderAndShowConfirmation(response);
    }

    // Calculate and return counts based on the response
    function calculateCounts(serviceResponses) {
        var counts = {
            passed: 0,
            failedAtLeastOnce: 0,
            failedAll: 0
        };

        $.each(serviceResponses, function(serviceName, serviceData) {
            if (serviceData.overall_status === 'GREEN') {
                counts.passed++;
            } else if (serviceData.overall_status === 'RED') {
                counts.failedAll++;
            } else if (serviceData.overall_status === 'AMBER') {
                counts.failedAtLeastOnce++;
            }
        });

        return counts;
    }

    // Update table rows with response details
    function updateTableRows(serviceResponses) {
        $.each(serviceResponses, function(serviceName, serviceData) {
            var serviceNameParts = serviceName.split(':');

            if (serviceNameParts.length !== 2) {
                console.error('Invalid service name format:', serviceName);
                return;
            }

            updateTableRow(serviceNameParts, serviceData);
        });
    }

    // Update individual table row with service data
    function updateTableRow(serviceNameParts, serviceData) {
        $('#service-table').DataTable().rows().every(function() {
            var rowData = this.data();

            if (rowData[1] === serviceNameParts[0] && rowData[2] === serviceNameParts[1]) {
                var rowNode = this.node();

                updateStatusAndCounts(rowNode, serviceData);
                updateRequestExecuted(rowNode, serviceData);
                updateStatusDescription(rowNode, serviceData);
                updateResultCell(rowNode, serviceData);
                createModalContent(serviceNameParts[0], serviceNameParts[1], serviceData);
            }
        });
    }

    // Update status and counts
    function updateStatusAndCounts(rowNode, serviceData) {
        var overallStatusCell = $(rowNode).find('td:nth-child(4)');
        var statusDescriptionCell = $(rowNode).find('td:nth-child(5)');

        var statusColor = getStatusColor(serviceData.overall_status);
        overallStatusCell.html('<img src="' + statusColor + '" alt="' + serviceData.overall_status + '">');
        overallStatusCell.append($('<span>').text(' ' + serviceData.passed_count + ' of ' + serviceData.total_iterations));

        statusDescriptionCell.empty();
        $.each(serviceData.status_descriptions, function(index, description) {
            statusDescriptionCell.append('<div>Iteration ' + (index + 1) + ': ' + description + '</div>');
        });
    }

    // Get status color based on overall status
    function getStatusColor(overallStatus) {
        var statusColor = '';

        if (overallStatus === "GREEN") {
            statusColor = "/static/images/green.png";
        } else if (overallStatus === "AMBER") {
            statusColor = "/static/images/amber.png";
        } else if (overallStatus === "RED") {
            statusColor = "/static/images/red.png";
        }

        return statusColor;
    }

    // Update request executed
    function updateRequestExecuted(rowNode, serviceData) {
        var requestExecutedCell = $(rowNode).find('td:nth-child(9)');
        var rawRequests = '';

        serviceData.raw_requests.forEach(function(request) {
            rawRequests += request.method + ' ' + request.url + ' | ';
            rawRequests += 'Headers: ' + JSON.stringify(request.headers) + ' | ';

            if (request.method === 'POST' && request.data) {
                if (request.headers['Content-Type'] === 'application/xml') {
                    rawRequests += 'Request Body (XML): ' + request.data + ' | ';
                } else if (request.headers['Content-Type'] === 'application/json') {
                    rawRequests += 'Request Body (JSON): ' + JSON.stringify(request.data) + ' | ';
                }
            }
        });

        rawRequests = rawRequests.slice(0, -3);

        requestExecutedCell.html(rawRequests);
        requestExecutedCell.hide();
    }

    // Update status description
    function updateStatusDescription(rowNode, serviceData) {
        var statusDescriptionCell = $(rowNode).find('td:nth-child(5)');

        statusDescriptionCell.empty();
        $.each(serviceData.status_descriptions, function(index, description) {
            statusDescriptionCell.append('<div>Iteration ' + (index + 1) + ': ' + description + '</div>');
        });
    }

    // Update result cell
    function updateResultCell(rowNode, serviceData) {
        var resultCell = $(rowNode).find('td:nth-child(8)');
        var responseDetails = '';

        $.each(serviceData.responses, function(index, iterationResponse) {
            var iterationNumber = index + 1;
            var iterationStatus = iterationResponse.status === 'PASS' ? 'PASS' : 'FAIL';
            var sanitizedResponse = iterationResponse.response.replace(/\n/g, ' ');
            var sanitizedResponse = sanitizedResponse.replace(/\\n/g, ' ');

            responseDetails += '<b>Iteration ' + iterationNumber + ' - ' + iterationStatus + '</b>: ' + sanitizedResponse + ' | ';
        });

        responseDetails = responseDetails.slice(0, -3);

        resultCell.html(responseDetails);
    }

// Update "Show Results" button and associated modal for each service
function updateShowResultsButtons(response) {
    var table = $('#service-table').DataTable();

    // Iterate through each row and update the Info column
    table.rows().every(function() {
        var rowData = this.data();
        var serviceName = rowData[1];
        var operationName = rowData[2];
//        console.log("ServiceName:", serviceName); // Log serviceName
        var rowNode = this.node();
        var infoCell = $(rowNode).find('td:nth-child(7)');

        if (response.responses && response.responses.hasOwnProperty(serviceName + ':' + operationName)) {
            var showResultsBtn = $('<button type="button" class="btn btn-info show-results-btn" data-toggle="modal" data-target="#modal-' + serviceName + '">Results</button>');
            showResultsBtn.click(function() {
                var modalId = '#modal-' + serviceName + '-' + operationName;
                $(modalId).modal('show');
            });
            // Append the "Show Results" button to the existing content in the Info column
            infoCell.append(showResultsBtn);
            createModalContent(serviceName, operationName, response.responses[serviceName + ':' + operationName]);
        }
    });
}

// Create modal content for "Show Results" button
function createModalContent(actualServiceName, actualOperationName, serviceData) {
    var accordionContainer = $('<div class="accordion" id="accordion-' + actualServiceName + '">');

    $.each(serviceData.responses, function(index, iterationResponse) {
        var iterationNumber = index + 1;
        var iterationStatus = iterationResponse.status === 'PASS' ? 'PASS' : 'FAIL';

        accordionContainer.append(
            '<div class="card">' +
            '<div class="card-header">' +
            '<h2 class="mb-0">' +
            '<button class="btn btn-link" type="button" data-toggle="collapse" ' +
            'data-target="#collapse-' + actualServiceName + '-' + iterationNumber + '">' +
            'Iteration ' + iterationNumber + ' - ' + iterationStatus +
            '</button>' +
            '</h2>' +
            '</div>' +
            '<div id="collapse-' + actualServiceName + '-' + iterationNumber + '" class="collapse" ' +
            'aria-labelledby="heading-' + actualServiceName + '-' + iterationNumber + '" ' +
            'data-parent="#accordion-' + actualServiceName + '">' +
            '<div class="card-body">' +
            iterationResponse.response +
            '</div>' +
            '</div>' +
            '</div>'
        );
    });

    var modalContent = $('<div class="modal fade" id="modal-' + actualServiceName + '-' + actualOperationName + '">').append(
        $('<div class="modal-dialog modal-dialog-scrollable modal-lg">').append(
            $('<div class="modal-content">').append(
                $('<div class="modal-header">').append(
                    $('<h5 class="modal-title">').text('Results for ' + actualServiceName + ':' + actualOperationName)
                ),
                $('<div class="modal-body">').append(accordionContainer),
                $('<div class="modal-footer">').append(
                    $('<button type="button" class="btn btn-secondary" data-dismiss="modal">Close</button>')
                )
            )
        )
    );

    $('body').append(modalContent);
}
//    // Create modal for showing detailed results
//    function createModal(serviceNameParts, serviceData) {
//        var accordionContainer = $('<div class="accordion" id="accordion-' + serviceNameParts[0] + '">');
//
//        $.each(serviceData.responses, function(index, iterationResponse) {
//            var iterationNumber = index + 1;
//            var iterationStatus = iterationResponse.status === 'PASS' ? 'PASS' : 'FAIL';
//            var modalId = 'modal-' + serviceNameParts[0] + '-' + serviceNameParts[1] + '-' + iterationNumber;
//
//            var modal = $('<div class="modal fade" id="' + modalId + '" tabindex="-1" role="dialog" aria-labelledby="' + modalId + 'Label" aria-hidden="true">');
//            var modalDialog = $('<div class="modal-dialog modal-dialog-centered modal-lg" role="document">');
//            var modalContent = $('<div class="modal-content">');
//            var modalHeader = $('<div class="modal-header">');
//            var modalTitle = $('<h5 class="modal-title">').text('Service: ' + serviceNameParts[0] + ', Operation: ' + serviceNameParts[1] + ', Iteration: ' + iterationNumber);
//            var modalCloseButton = $('<button type="button" class="close" data-dismiss="modal" aria-label="Close">').html('<span aria-hidden="true">&times;</span>');
//            var modalBody = $('<div class="modal-body">').text(iterationResponse.response);
//
//            modalHeader.append(modalTitle, modalCloseButton);
//            modalContent.append(modalHeader, modalBody);
//            modalDialog.append(modalContent);
//            modal.append(modalDialog);
//            accordionContainer.append(modal);
//        });
//
//        $('body').append(accordionContainer);
//    }

//    // Update the display of show results buttons
//    function updateShowResultsButtons(response) {
//        $('#service-table').DataTable().rows().every(function() {
//            var rowData = this.data();
//            var rowNode = this.node();
//            var showResultsBtn = $(rowNode).find('.show-results-btn');
//            if (response.responses.hasOwnProperty(rowData[1] + ':' + rowData[2])) {
//                showResultsBtn.show();
//                showResultsBtn.click(function() {
//                    var serviceNameParts = [rowData[1], rowData[2]];
//                    var accordionId = '#accordion-' + serviceNameParts[0];
//                    var iterationNumber = response.responses[serviceNameParts.join(':')].responses.length;
//                    var modalId = '#modal-' + serviceNameParts[0] + '-' + serviceNameParts[1] + '-' + iterationNumber;
//                    $(accordionId).find('.modal').modal('hide');
//                    $(modalId).modal('show');
//                });
//            }
//        });
//    }


    // Hide loader and show confirmation message
    function hideLoaderAndShowConfirmation(response) {
        $('#loader-overlay').hide();
        if (response.error) {
            showConfirmation(response.error, 'error');
        } else {
            showConfirmation('Execution completed successfully.', 'success');
        }
    }

    // Handle execution errors
    function handleExecutionError(xhr, status, error) {
        $('#loader-overlay').hide();
        showConfirmation('Error executing services: ' + error, 'error');
    }

    // Function to update the counts display
    function updateCountsDisplay(counts) {
        $('#passed-count-value').text(counts.passed);
        $('#failed-at-least-once-count-value').text(counts.failedAtLeastOnce);
        $('#failed-all-count-value').text(counts.failedAll);
    }
});
