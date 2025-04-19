(function ($) {
    "use strict"; // Start of use strict
  
    document.getElementById('footer').innerHTML = '&copy; ' + new Date().getFullYear() + ' Neel Patel'
  
    // Smooth scrolling using jQuery easing
    $('a.js-scroll-trigger[href*="#"]:not([href="#"])').click(function () {
      if (location.pathname.replace(/^\//, '') == this.pathname.replace(/^\//, '') && location.hostname == this.hostname) {
        var target = $(this.hash);
        target = target.length ? target : $('[name=' + this.hash.slice(1) + ']');
        if (target.length) {
          $('html, body').animate({
            scrollTop: (target.offset().top)
          }, 1000, "easeInOutExpo");
          return false;
        }
      }
    });
  
    // Closes responsive menu when a scroll trigger link is clicked
    $('.js-scroll-trigger').click(function () {
      $('.navbar-collapse').collapse('hide');
    });
  
    // ===== Scroll to Top ==== 
    $(window).scroll(function () {
      if ($(this).scrollTop() >= 700) {        // If page is scrolled more than 700px
        $('#return-to-top').fadeIn(200);    // Fade in the arrow
      } else {
        $('#return-to-top').fadeOut(200);   // Else fade out the arrow
      }
    });
    $('#return-to-top').click(function () {      // When arrow is clicked
      $('body,html').animate({
        scrollTop: 0                       // Scroll to top of body
      }, 500);
    });
  
    // Activate scrollspy to add active class to navbar items on scroll
    $('body').scrollspy({
      target: '#sideNav'
    });
  
    $('[data-toggle="tooltip"]').tooltip();
  
  
    window.addEventListener('load', function () {
      // Fetch all the forms we want to apply custom Bootstrap validation styles to
      var form = document.getElementsByClassName('needs-validation')[0];
  
      var resumeDownloadBtn = document.getElementById("resumeEmailSubmit");
      resumeDownloadBtn.addEventListener('click', function (event) {
        if (form.checkValidity() === false) {
          event.preventDefault();
          event.stopPropagation();
        } else {
          var emailInput = document.getElementById("resumeEmailInput").value;
          var isValidEmail = validateEmail(emailInput);
          if (!isValidEmail) {
            document.getElementById("resumeEmailInput").value = '';
            event.preventDefault();
            event.stopPropagation();
          } else {
            $('#resumeDownload').modal('hide');
            ga('send', 'pageview', 'resumeDownload?email=' + emailInput);
          }
        }
        form.classList.add('was-validated');
      }, false);
  
      function validateEmail(email) {
        var re = /^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
        return re.test(email);
      }
    }, false);
  })(jQuery); // End of use strict
  