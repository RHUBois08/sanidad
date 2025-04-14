const scriptURL = "https://script.google.com/macros/s/AKfycbxZNwi1Dsp0o3pBuMbo7afM5kOsQn1F3HiH9ZbigWlEuiWZB3HjwvneipQiCRnZC2Qj7A/exec";
const form = document.forms["submit-to-google-sheet"];

form.addEventListener("submit", (e) => {
  e.preventDefault();
  var formData = new FormData(form);

  fetch(scriptURL, { method: "POST", body: formData })
    .then((response) => {
      swal({
        title: "Done",
        text: "Submitted Successfully.",
        icon: "success",
        button: "OK",
      }).then((value) => {
          if (value) { 
              window.location.href = "index.html";
          }
      });
      form.reset();
    })
    .catch((error) => {
      swal("Error", "Something went wrong. Please try again!", "error");
    });
});