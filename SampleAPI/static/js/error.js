// Function to display error message in modal
	function showErrorModal(indicator, message) {
		var modalHeader = $('#errorModalHeader');
		var errorMessage = $('#errorMessage');
		var errorModalLabel = $('#errorModalLabel');
		// Set header color based on indicator
		if(indicator === 'success') {
			modalHeader.removeClass('bg-danger').addClass('bg-success');
			errorModalLabel.text("Success");
		} else {
			modalHeader.removeClass('bg-success').addClass('bg-danger');
			errorModalLabel.text("Error");
		}
		// Set error message
		errorMessage.text(message);
<!--		// Remove the data-dismiss attribute from the close button-->
<!--    $('#errorModal [data-dismiss="modal"]').removeAttr('data-dismiss');-->
		// Show the modal
		$('#errorModal').modal('show');


	}