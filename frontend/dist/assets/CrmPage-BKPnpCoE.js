function r(n){if(!n)return"";let e=String(n).replace(/\s+/g,"");const i=e.indexOf("@");return i>=0&&(e=e.slice(0,i+1)+e.slice(i+1).replace(/@/g,"")),e}export{r as n};
