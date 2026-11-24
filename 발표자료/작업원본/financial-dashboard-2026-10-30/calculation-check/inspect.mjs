import {FileBlob,SpreadsheetFile} from '@oai/artifact-tool';
const workbook=await SpreadsheetFile.importXlsx(await FileBlob.load(process.argv[2]));
console.log((await workbook.inspect({kind:'sheet',include:'id,name',maxChars:1800})).ndjson);
