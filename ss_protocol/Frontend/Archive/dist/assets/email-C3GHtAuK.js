import{A as D,v as y,ai as p,E as c,aU as _,t as s,S as f,D as C,o as u,h as R,q as b,L as d,x as m,ag as E,aV as W,aW as $,aX as N,y as P}from"./index-Fje8cVxI.js";import{W as g}from"./index-CO0hPiN5.js";var T=function(o,e,t,a){var n=arguments.length,i=n<3?e:a===null?a=Object.getOwnPropertyDescriptor(e,t):a,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")i=Reflect.decorate(o,e,t,a);else for(var l=o.length-1;l>=0;l--)(r=o[l])&&(i=(n<3?r(i):n>3?r(e,t,i):r(e,t))||i);return n>3&&i&&Object.defineProperty(e,t,i),i};let x=class extends g{constructor(){super(...arguments),this.onOtpSubmit=async e=>{var t,a;try{if(this.authConnector){const n=D.state.activeChain,i=y.getConnections(n),r=(t=p.state.remoteFeatures)==null?void 0:t.multiWallet,l=i.length>0;if(await this.authConnector.provider.connectOtp({otp:e}),c.sendEvent({type:"track",event:"EMAIL_VERIFICATION_CODE_PASS"}),n)await y.connectExternal(this.authConnector,n);else throw new Error("Active chain is not set on ChainControll");if(c.sendEvent({type:"track",event:"CONNECT_SUCCESS",properties:{method:"email",name:this.authConnector.name||"Unknown"}}),(a=p.state.remoteFeatures)!=null&&a.emailCapture)return;if(p.state.siwx){_.close();return}if(l&&r){s.replace("ProfileWallets"),f.showSuccess("New Wallet Added");return}_.close()}}catch(n){throw c.sendEvent({type:"track",event:"EMAIL_VERIFICATION_CODE_FAIL",properties:{message:C.parseError(n)}}),n}},this.onOtpResend=async e=>{this.authConnector&&(await this.authConnector.provider.connectEmail({email:e}),c.sendEvent({type:"track",event:"EMAIL_VERIFICATION_CODE_SENT"}))}}};x=T([u("w3m-email-verify-otp-view")],x);const U=R`
  wui-icon-box {
    height: var(--wui-icon-box-size-xl);
    width: var(--wui-icon-box-size-xl);
  }
`;var S=function(o,e,t,a){var n=arguments.length,i=n<3?e:a===null?a=Object.getOwnPropertyDescriptor(e,t):a,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")i=Reflect.decorate(o,e,t,a);else for(var l=o.length-1;l>=0;l--)(r=o[l])&&(i=(n<3?r(i):n>3?r(e,t,i):r(e,t))||i);return n>3&&i&&Object.defineProperty(e,t,i),i};let w=class extends b{constructor(){var e;super(),this.email=(e=s.state.data)==null?void 0:e.email,this.authConnector=d.getAuthConnector(),this.loading=!1,this.listenForDeviceApproval()}render(){if(!this.email)throw new Error("w3m-email-verify-device-view: No email provided");if(!this.authConnector)throw new Error("w3m-email-verify-device-view: No auth connector provided");return m`
      <wui-flex
        flexDirection="column"
        alignItems="center"
        .padding=${["xxl","s","xxl","s"]}
        gap="l"
      >
        <wui-icon-box
          size="xl"
          iconcolor="accent-100"
          backgroundcolor="accent-100"
          icon="verify"
          background="opaque"
        ></wui-icon-box>

        <wui-flex flexDirection="column" alignItems="center" gap="s">
          <wui-flex flexDirection="column" alignItems="center">
            <wui-text variant="paragraph-400" color="fg-100">
              Approve the login link we sent to
            </wui-text>
            <wui-text variant="paragraph-400" color="fg-100"><b>${this.email}</b></wui-text>
          </wui-flex>

          <wui-text variant="small-400" color="fg-200" align="center">
            The code expires in 20 minutes
          </wui-text>

          <wui-flex alignItems="center" id="w3m-resend-section" gap="xs">
            <wui-text variant="small-400" color="fg-100" align="center">
              Didn't receive it?
            </wui-text>
            <wui-link @click=${this.onResendCode.bind(this)} .disabled=${this.loading}>
              Resend email
            </wui-link>
          </wui-flex>
        </wui-flex>
      </wui-flex>
    `}async listenForDeviceApproval(){if(this.authConnector)try{await this.authConnector.provider.connectDevice(),c.sendEvent({type:"track",event:"DEVICE_REGISTERED_FOR_EMAIL"}),c.sendEvent({type:"track",event:"EMAIL_VERIFICATION_CODE_SENT"}),s.replace("EmailVerifyOtp",{email:this.email})}catch{s.goBack()}}async onResendCode(){try{if(!this.loading){if(!this.authConnector||!this.email)throw new Error("w3m-email-login-widget: Unable to resend email");this.loading=!0,await this.authConnector.provider.connectEmail({email:this.email}),this.listenForDeviceApproval(),f.showSuccess("Code email resent")}}catch(e){f.showError(e)}finally{this.loading=!1}}};w.styles=U;S([E()],w.prototype,"loading",void 0);w=S([u("w3m-email-verify-device-view")],w);const F=R`
  wui-email-input {
    width: 100%;
  }

  form {
    width: 100%;
    display: block;
    position: relative;
  }
`;var O=function(o,e,t,a){var n=arguments.length,i=n<3?e:a===null?a=Object.getOwnPropertyDescriptor(e,t):a,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")i=Reflect.decorate(o,e,t,a);else for(var l=o.length-1;l>=0;l--)(r=o[l])&&(i=(n<3?r(i):n>3?r(e,t,i):r(e,t))||i);return n>3&&i&&Object.defineProperty(e,t,i),i};let h=class extends b{constructor(){var e,t;super(...arguments),this.formRef=W(),this.initialEmail=((e=s.state.data)==null?void 0:e.email)??"",this.redirectView=(t=s.state.data)==null?void 0:t.redirectView,this.email="",this.loading=!1}firstUpdated(){var e;(e=this.formRef.value)==null||e.addEventListener("keydown",t=>{t.key==="Enter"&&this.onSubmitEmail(t)})}render(){return m`
      <wui-flex flexDirection="column" padding="m" gap="m">
        <form ${$(this.formRef)} @submit=${this.onSubmitEmail.bind(this)}>
          <wui-email-input
            value=${this.initialEmail}
            .disabled=${this.loading}
            @inputChange=${this.onEmailInputChange.bind(this)}
          >
          </wui-email-input>
          <input type="submit" hidden />
        </form>
        ${this.buttonsTemplate()}
      </wui-flex>
    `}onEmailInputChange(e){this.email=e.detail}async onSubmitEmail(e){try{if(this.loading)return;this.loading=!0,e.preventDefault();const t=d.getAuthConnector();if(!t)throw new Error("w3m-update-email-wallet: Auth connector not found");const a=await t.provider.updateEmail({email:this.email});c.sendEvent({type:"track",event:"EMAIL_EDIT"}),a.action==="VERIFY_SECONDARY_OTP"?s.push("UpdateEmailSecondaryOtp",{email:this.initialEmail,newEmail:this.email,redirectView:this.redirectView}):s.push("UpdateEmailPrimaryOtp",{email:this.initialEmail,newEmail:this.email,redirectView:this.redirectView})}catch(t){f.showError(t),this.loading=!1}}buttonsTemplate(){const e=!this.loading&&this.email.length>3&&this.email!==this.initialEmail;return this.redirectView?m`
      <wui-flex gap="s">
        <wui-button size="md" variant="neutral" fullWidth @click=${s.goBack}>
          Cancel
        </wui-button>

        <wui-button
          size="md"
          variant="main"
          fullWidth
          @click=${this.onSubmitEmail.bind(this)}
          .disabled=${!e}
          .loading=${this.loading}
        >
          Save
        </wui-button>
      </wui-flex>
    `:m`
        <wui-button
          size="md"
          variant="main"
          fullWidth
          @click=${this.onSubmitEmail.bind(this)}
          .disabled=${!e}
          .loading=${this.loading}
        >
          Save
        </wui-button>
      `}};h.styles=F;O([E()],h.prototype,"email",void 0);O([E()],h.prototype,"loading",void 0);h=O([u("w3m-update-email-wallet-view")],h);var j=function(o,e,t,a){var n=arguments.length,i=n<3?e:a===null?a=Object.getOwnPropertyDescriptor(e,t):a,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")i=Reflect.decorate(o,e,t,a);else for(var l=o.length-1;l>=0;l--)(r=o[l])&&(i=(n<3?r(i):n>3?r(e,t,i):r(e,t))||i);return n>3&&i&&Object.defineProperty(e,t,i),i};let I=class extends g{constructor(){var e;super(),this.email=(e=s.state.data)==null?void 0:e.email,this.onOtpSubmit=async t=>{try{this.authConnector&&(await this.authConnector.provider.updateEmailPrimaryOtp({otp:t}),c.sendEvent({type:"track",event:"EMAIL_VERIFICATION_CODE_PASS"}),s.replace("UpdateEmailSecondaryOtp",s.state.data))}catch(a){throw c.sendEvent({type:"track",event:"EMAIL_VERIFICATION_CODE_FAIL",properties:{message:C.parseError(a)}}),a}},this.onStartOver=()=>{s.replace("UpdateEmailWallet",s.state.data)}}};I=j([u("w3m-update-email-primary-otp-view")],I);var L=function(o,e,t,a){var n=arguments.length,i=n<3?e:a===null?a=Object.getOwnPropertyDescriptor(e,t):a,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")i=Reflect.decorate(o,e,t,a);else for(var l=o.length-1;l>=0;l--)(r=o[l])&&(i=(n<3?r(i):n>3?r(e,t,i):r(e,t))||i);return n>3&&i&&Object.defineProperty(e,t,i),i};let A=class extends g{constructor(){var e,t;super(),this.email=(e=s.state.data)==null?void 0:e.newEmail,this.redirectView=(t=s.state.data)==null?void 0:t.redirectView,this.onOtpSubmit=async a=>{try{this.authConnector&&(await this.authConnector.provider.updateEmailSecondaryOtp({otp:a}),c.sendEvent({type:"track",event:"EMAIL_VERIFICATION_CODE_PASS"}),this.redirectView&&s.reset(this.redirectView))}catch(n){throw c.sendEvent({type:"track",event:"EMAIL_VERIFICATION_CODE_FAIL",properties:{message:C.parseError(n)}}),n}},this.onStartOver=()=>{s.replace("UpdateEmailWallet",s.state.data)}}};A=L([u("w3m-update-email-secondary-otp-view")],A);var V=function(o,e,t,a){var n=arguments.length,i=n<3?e:a===null?a=Object.getOwnPropertyDescriptor(e,t):a,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")i=Reflect.decorate(o,e,t,a);else for(var l=o.length-1;l>=0;l--)(r=o[l])&&(i=(n<3?r(i):n>3?r(e,t,i):r(e,t))||i);return n>3&&i&&Object.defineProperty(e,t,i),i};let v=class extends b{constructor(){var e;super(),this.authConnector=d.getAuthConnector(),this.isEmailEnabled=(e=p.state.remoteFeatures)==null?void 0:e.email,this.isAuthEnabled=this.checkIfAuthEnabled(d.state.connectors),this.connectors=d.state.connectors,d.subscribeKey("connectors",t=>{this.connectors=t,this.isAuthEnabled=this.checkIfAuthEnabled(this.connectors)})}render(){if(!this.isEmailEnabled)throw new Error("w3m-email-login-view: Email is not enabled");if(!this.isAuthEnabled)throw new Error("w3m-email-login-view: No auth connector provided");return m`<wui-flex
      flexDirection="column"
      .padding=${["3xs","m","m","m"]}
      gap="l"
    >
      <w3m-email-login-widget></w3m-email-login-widget>
    </wui-flex> `}checkIfAuthEnabled(e){const t=e.filter(n=>n.type===N.CONNECTOR_TYPE_AUTH).map(n=>n.chain);return P.AUTH_CONNECTOR_SUPPORTED_CHAINS.some(n=>t.includes(n))}};V([E()],v.prototype,"connectors",void 0);v=V([u("w3m-email-login-view")],v);export{v as W3mEmailLoginView,g as W3mEmailOtpWidget,w as W3mEmailVerifyDeviceView,x as W3mEmailVerifyOtpView,I as W3mUpdateEmailPrimaryOtpView,A as W3mUpdateEmailSecondaryOtpView,h as W3mUpdateEmailWalletView};
