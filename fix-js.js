const fs = require('fs');
let js = fs.readFileSync('extensions/cod-form-block/assets/cod-form.js', 'utf8');

// Fix getProductPageOffersForConfig to search in wrapper as well
js = js.replace(
  /function getProductPageOffersForConfig\(config\) \{[\s\S]*?var all = \(config && config\.rootElement\)[\s\S]*?\? config\.rootElement\.querySelectorAll\('\.cod-product-page-offers'\)[\s\S]*?: document\.querySelectorAll\('\.cod-product-page-offers'\);/,
  `function getProductPageOffersForConfig(config) {
      var all;
      if (config && config.rootElement) {
          var container = config.rootElement._foxcodInjectedWrapper ? config.rootElement._foxcodInjectedWrapper : config.rootElement;
          all = container.querySelectorAll('.cod-product-page-offers');
      } else {
          all = document.querySelectorAll('.cod-product-page-offers');
      }`
);

fs.writeFileSync('extensions/cod-form-block/assets/cod-form.js', js);
console.log('Fixed getProductPageOffersForConfig');
