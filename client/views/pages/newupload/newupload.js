refreshUploadStatus = null

Template.newupload.rendered = function() {
  Session.set('uploadToken', null)
  Session.set('uploadVideoProgress', null)
}

Template.newupload.createPermlink = function(length) {
  var text = "";
  var possible = "abcdefghijklmnopqrstuvwxyz0123456789";

  for (var i = 0; i < length; i++)
    text += possible.charAt(Math.floor(Math.random() * possible.length));

  return text;
}

Template.newupload.HTTP = function(node, file, progressid, cb) {
  var postUrl = 'http://195.154.183.40:5000/uploadVideo?videoEncodingFormats=480p&sprite=true'
  //var postUrl = node.protocol+'://'+node.host+':'+node.port+'/api/v0/add?stream-channels=true'
  var formData = new FormData();
  formData.append('files', file);
  $(progressid).progress({value: 0, total: 1})
  $(progressid).show();
  $.ajax({
    url: postUrl,
    type: "POST",
    data: formData,
    xhr: function() {
      var xhr = new window.XMLHttpRequest();
      xhr.upload.addEventListener("progress", function(evt) {
        if (evt.lengthComputable) {
          $(progressid).progress({ value: evt.loaded, total: evt.total });
          if (evt.loaded == evt.total) {
            $(progressid).progress({ value: evt.loaded, total: evt.total });
            $('#progressvideo > .label').html('File received. Requesting Token...')
          }
        }
      }, false);
      return xhr;
    },
    cache: false,
    contentType: false,
    processData: false,
    success: function(result) {
      $(progressid).hide()
      Session.set('uploadToken', result.token)
      refreshUploadStatus = setInterval(function() {
        Template.uploadvideoprogress.update()
      }, 1000)
      cb(null, result)
    },
    error: function(error) {
      $(progressid).hide()
      cb(error)
    }
  });
}

Template.newupload.IPFS = function(node, file, cb) {
  console.log(node,file)
  var reader = new window.FileReader()
  reader.onload = function(event) {
    var ipfsCon = IpfsApi(node)
    ipfsCon.add(new ipfsCon.Buffer(event.target.result), function(err, res) {
      cb(err, res)
    })
  }
  reader.readAsArrayBuffer(file);
}

Template.newupload.uploadVideo = function(dt) {
  if (!dt.files || dt.files.length == 0) {
    toastr.error(translate('UPLOAD_ERROR_UPLOAD_FILE'), translate('ERROR_TITLE'))
    return
  }
  var file = dt.files[0]
  if (file.type.split('/')[0] != 'video') {
    toastr.error(translate('UPLOAD_ERROR_WRONG_FORMAT'), translate('ERROR_TITLE'))
    return
  }

  $('#step1load').show()

  $('#dropzone').hide()
  $('input[name="title"]').val(file.name.substring(0, file.name.lastIndexOf(".")))

  // displaying the preview
  var videoNode = document.querySelector('video')
  var fileURL = URL.createObjectURL(file)
  videoNode.src = fileURL

  // uploading to ipfs
  node = Session.get('ipfsUpload')
  Template.newupload.HTTP(node, file, '#progressvideo', function(err, result) {
    $('#step1load').hide()
    if (err) {
      console.log(err)
      toastr.error(err, translate('UPLOAD_ERROR_IPFS_UPLOADING'))
      return
    } else {
      console.log('Uploaded video', result);
    }
  })

  console.log(file)
  $('input[name="filesize"]').val(file.size)
  Torrent.seed(file, function(torrent) {
    $('input[name="magnet"]').val(torrent.magnetURI)
  })
}

Template.newupload.genBody = function(author, permlink, title, snaphash, videohash, description) {
  var body = '<center>'
  body += '<a href=\'https://d.tube/#!/v/'+author+'/'+permlink+'\'>'
  body += '<img src=\''+Meteor.getIpfsSrc(snaphash)+'\'></a></center><hr>'
  body += description
  body += '<hr>'
  body += '<a href=\'https://d.tube/#!/v/'+author+'/'+permlink+'\'> ▶️ '+translate('UPLOAD_WATCH_ON_DTUBE')+' DTube</a><br />'
  body += '<a href=\''+Meteor.getIpfsSrc(videohash)+'\'> ▶️ '+translate('UPLOAD_WATCH_SOURCE_IPFS')+'</a>'
  return body
}

Template.newupload.events({
  'click #dropzone': function(event) {
    $('#fileToUpload').click()
  },
  'change #fileToUpload': function(event) {
    Template.newupload.uploadVideo(event.target)
  },
  'dropped #dropzone': function(event) {
    Template.newupload.uploadVideo(event.originalEvent.dataTransfer)
  },
  'click #snap': function(event) {
      var video = document.querySelector('video')
      var canvas = document.querySelector('canvas')
      var context = canvas.getContext('2d')
      var w,h,ratio

    // Calculate the ratio of the video's width to height
        ratio = video.videoWidth / video.videoHeight
        // Define the required width as 100 pixels smaller than the actual video's width
        w = video.videoWidth - 100
        // Calculate the height based on the video's width and the ratio
        h = parseInt(w / ratio, 10)
        // Set the canvas width and height to the values just calculated
        canvas.width = w
        canvas.height = h

    // Define the size of the rectangle that will be filled (basically the entire element)
        context.fillRect(0, 0, w, h)
        // Grab the image from the video
        context.drawImage(video, 0, 0, w, h)
    // Save snap to disk
    var dt = canvas.toDataURL('image/jpeg')
    $('#snap').attr('href', dt)
  },
  'change #snapFile': function(event) {
    var file = event.currentTarget.files[0];
    var ValidImageTypes = ["image/gif", "image/jpeg", "image/png"];
    if (file.type.split('/')[0] != 'image') {
      toastr.error(translate('UPLOAD_ERROR_NOT_IMAGE'), translate('ERROR_TITLE'))
      return
    }
    if (file.size > Session.get('remoteSettings').snapMaxFileSizeKB*1000) {
      toastr.error(translate('UPLOAD_ERROR_REACH_MAX_SIZE')+' '+Session.get('remoteSettings').snapMaxFileSizeKB+' KB', translate('ERROR_TITLE'))
      return
    }

    $('#step2load').show()

    // uploading to ipfs
    if (Session.get('ipfsUpload')) node = Session.get('ipfsUpload')
    Template.newupload.HTTP(node, file, '#progresssnap', function(err, result) {
      $('#step2load').hide()
      if (err) {
        console.log(err)
        toastr.error(err, translate('UPLOAD_ERROR_IPFS_UPLOADING'))
        return
      } else {
        $('#step2load').parent().addClass('completed')
        console.log('Uploaded Snap', result)
        $('input[name="snaphash"]').val(result.Hash)
      }
    })
  }
})
