const packagedApplicationPrefix = "shell:AppsFolder\\";

function getPackagedApplicationId(value) {
  if (typeof value !== "string" || !value.startsWith(packagedApplicationPrefix)) {
    return null;
  }

  const appId = value.slice(packagedApplicationPrefix.length);
  return /^[a-z0-9][a-z0-9._-]*![a-z0-9][a-z0-9._-]*$/i.test(appId) ? appId : null;
}

function isApplicationPath(value) {
  return typeof value === "string" && (
    /^[a-z]:\\[^\r\n\0]*\.exe$/i.test(value) ||
    /^\\\\[^\r\n\0]+\\[^\r\n\0]+\.exe$/i.test(value) ||
    Boolean(getPackagedApplicationId(value))
  );
}

module.exports = { getPackagedApplicationId, isApplicationPath };
