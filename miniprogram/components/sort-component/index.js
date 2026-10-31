var app = getApp();
Component({
  properties: {
    text: "",
  },
  data: {
    icon: {
      up: "".concat(
        app.config.imgHost,
        "/img/customer/duibuIcon/icon/Icon_Sorting_Down_Gray@2x.png",
      ),
      down: "/assets/images/icon2nd/Icon_Sorting_Up_Gray@2x.png",
    },
    sort: "asc",
  },
  methods: {
    changeAsc: function () {
      ("asc" === this.data.sort
        ? this.setData({
            sort: "desc",
          })
        : this.setData({
            sort: "asc",
          }),
        console.log(this.properties.text, "-----text"));
      var app = {
        sort: this.data.sort,
        text: this.properties.text,
      };
      this.triggerEvent("event", app, {
        bubbles: !1,
        composed: !1,
        captruePhase: !1,
      });
    },
  },
});
