module.exports = {
  formatRichText: function (e) {
    var a = e.replace(/<img[^>]*>/gi, function (e, a) {
      return (e = (e = (e = e.replace(/style="[^"]+"/gi, "").replace(/style='[^']+'/gi, ""))
        .replace(/width="[^"]+"/gi, "")
        .replace(/width='[^']+'/gi, ""))
        .replace(/height="[^"]+"/gi, "")
        .replace(/height='[^']+'/gi, ""));
    });
    return (a = (a = (a = (a = (a = (a = (a = a.replace(/style="[^"]+"/gi, function (e, a) {
      return (e = e
        .replace(/<p>/gi, '<p class="p_class">')
        .replace(/width:[^;]+;/gi, "max-width:100%;")
        .replace(/width:[^;]+;/gi, "max-width:100%;"));
    })).replace(/<a>/gi, '<a class="p_class "')).replace(/<li>/gi, '<li class="p_class "')).replace(
      /\<p/gi,
      '<p class="p_class "',
    )).replace(/\<span/gi, '<span class="p_class "')).replace(
      /\<ul/gi,
      '<span class="p_class "',
    )).replace(
      /\<img/gi,
      '<img style="max-width:100%;width: 100%;height:auto;display:block;margin-top:0;margin-bottom:0;"',
    ));
  },
};
