import{h as g,k as h,l as c,m as p,o as x,q as w,x as u}from"./index-Fje8cVxI.js";const m=g`
  :host {
    display: block;
  }

  :host > button,
  :host > wui-flex {
    gap: var(--wui-spacing-xxs);
    padding: var(--wui-spacing-xs);
    padding-right: var(--wui-spacing-1xs);
    height: 40px;
    border-radius: var(--wui-border-radius-l);
    background: var(--wui-color-gray-glass-002);
    border-width: 0px;
    box-shadow: inset 0 0 0 1px var(--wui-color-gray-glass-002);
  }

  :host > button wui-image {
    width: 24px;
    height: 24px;
    border-radius: var(--wui-border-radius-s);
    box-shadow: inset 0 0 0 1px var(--wui-color-gray-glass-010);
  }
`;var l=function(r,t,o,s){var a=arguments.length,e=a<3?t:s===null?s=Object.getOwnPropertyDescriptor(t,o):s,n;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")e=Reflect.decorate(r,t,o,s);else for(var d=r.length-1;d>=0;d--)(n=r[d])&&(e=(a<3?n(e):a>3?n(t,o,e):n(t,o))||e);return a>3&&e&&Object.defineProperty(t,o,e),e};let i=class extends w{constructor(){super(...arguments),this.text="",this.loading=!1}render(){return this.loading?u` <wui-flex alignItems="center" gap="xxs" padding="xs">
        <wui-shimmer width="24px" height="24px"></wui-shimmer>
        <wui-shimmer width="40px" height="20px" borderRadius="4xs"></wui-shimmer>
      </wui-flex>`:u`
      <button>
        ${this.tokenTemplate()}
        <wui-text variant="paragraph-600" color="fg-100">${this.text}</wui-text>
      </button>
    `}tokenTemplate(){return this.imageSrc?u`<wui-image src=${this.imageSrc}></wui-image>`:u`
      <wui-icon-box
        size="sm"
        iconColor="fg-200"
        backgroundColor="fg-300"
        icon="networkPlaceholder"
      ></wui-icon-box>
    `}};i.styles=[h,c,m];l([p()],i.prototype,"imageSrc",void 0);l([p()],i.prototype,"text",void 0);l([p({type:Boolean})],i.prototype,"loading",void 0);i=l([x("wui-token-button")],i);
