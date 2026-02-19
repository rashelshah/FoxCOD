const fs = require('fs');
const file = 'app/routes/app.upsell-downsell.tsx';
let content = fs.readFileSync(file, 'utf8');

if (!content.includes('RangeSlider')) {
    content = content.replace(
        'import { ColorSelector, colorSelectorStyles } from "./ColorSelector";',
        'import { ColorSelector, colorSelectorStyles } from "./ColorSelector";\nimport { RangeSlider } from "@shopify/polaris";'
    );
}

// Regex to capture the standard sliders
const regexVars = /<div className="up-slider-wrap">\s*<input type="range" min="([^"]+)" max="([^"]+)" value={([^}]+)} onChange=\{e => ([A-Za-z0-9_]+)\(\{\s*([A-Za-z0-9_]+):\s*parseInt\(e\.target\.value\)(.*?)\s*\}\)\} style=\{[^\}]+\}\s*\/>\s*<span className="up-slider-val">[^<]+<\/span>\s*<\/div>/g;

content = content.replace(regexVars, (match, min, max, value, updFunc, propName, fallback) => {
    return `<div style={{ padding: '0 4px', width: '100%' }}>
                                                <RangeSlider
                                                    labelHidden
                                                    label="Slider"
                                                    min={${min}}
                                                    max={${max}}
                                                    value={${value}}
                                                    onChange={(val) => ${updFunc}({ ${propName}: ${fallback ? `(val${fallback})` : 'val'} })}
                                                    output
                                                />
                                            </div>`;
});

// Regex to capture the nested spread sliders (e.g. discountTag)
const regexComplex = /<div className="up-slider-wrap">\s*<input type="range" min="([^"]+)" max="([^"]+)" value={([^}]+)} onChange=\{e => ([A-Za-z0-9_]+)\(\{\s*([A-Za-z0-9_]+):\s*\{\s*\.\.\.([^,]+),\s*([A-Za-z0-9_]+):\s*parseInt\(e\.target\.value\)(.*?)\s*\}\s*\}\)\} style=\{[^\}]+\}\s*\/>\s*<span className="up-slider-val">[^<]+<\/span>\s*<\/div>/g;

content = content.replace(regexComplex, (match, min, max, value, updFunc, parentProp, spreadProp, propName, fallback) => {
    return `<div style={{ padding: '0 4px', width: '100%' }}>
                                                <RangeSlider
                                                    labelHidden
                                                    label="Slider"
                                                    min={${min}}
                                                    max={${max}}
                                                    value={${value}}
                                                    onChange={(val) => ${updFunc}({ ${parentProp}: { ...${spreadProp}, ${propName}: ${fallback ? `(val${fallback})` : 'val'} } })}
                                                    output
                                                />
                                            </div>`;
});

fs.writeFileSync(file, content);
console.log('Sliders replaced successfully.');
