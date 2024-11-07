const mysql = require('mysql2/promise');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const { htmlToText } = require('html-to-text');

async function getDocumentsToParse() {
    try {
        const data = await fs.readFile('doc_numbers.txt', 'utf8');
        // Разделяем данные по строкам
        const rows = data.split('\n').map(line => line.trim());
        // Вывод строк в консоль
        return rows;

    } catch (error) {
        console.error('Error fetching documents:', error.message);
        return [];
    }
}

function cleanText(htmlString) {

    let cleanText = htmlToText(htmlString);
  
    
    cleanText = cleanText.replace(/\s{2,}/g, ' ');
  
   
    cleanText = cleanText.replace(/\[data:image.*?\]/g, '');
  
    return cleanText.trim(); 
}

async function saveDataToFile(filename, data) {
    try {
        const filePath = path.join(__dirname, 'documents_saved', filename + '.txt'); // Путь для сохранени
        // Проверка, существует ли файл
        try {
            await fs.access(filePath);
            console.log(`File ${filePath} already exists. No action taken.`);
        } catch (err) {
            // Если файл не существует, создаем его и записываем данные
            console.log(`File ${filePath} does not exist. Saving data...`);
            await fs.writeFile(filePath, data);
            console.log(`Data successfully saved to ${filePath}`);
        }
    } catch (error) {
        console.error('Error saving data to file:', error);
    }
}

async function fetchAndSaveDocumentAll(arbitr_id) {
    try {
        let blockIndex = 1; // Инициализация blockIndex
        let hasMoreBlocks = true;
        let stringData = '';
        let blockCount = 0;

        while (hasMoreBlocks) {
            const blockBatch = []; // Массив для хранения запросов блоков
            for (let i = 0; i < 5 && hasMoreBlocks; i++) { // запускаем 5 запросов за раз
                const url = blockIndex === 1 
                    ? `https://sudrf.cntd.ru/document/${arbitr_id}` 
                    : `https://sudrf.cntd.ru/docs/document/${arbitr_id}/content/text/block/${blockIndex}?strict=true`;

                blockBatch.push(axios.get(url, { headers: {
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                        'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
                        'Cache-Control': 'no-cache',
                        'Pragma': 'no-cache',
                        'Sec-Ch-Ua': '"Not)A;Brand";v="99", "Google Chrome";v="127", "Chromium";v="127"',
                        'Sec-Ch-Ua-Mobile': '?0',
                        'Sec-Ch-Ua-Platform': '"Windows"',
                        'Sec-Fetch-Dest': 'document',
                        'Sec-Fetch-Mode': 'navigate',
                        'Sec-Fetch-Site': 'same-origin',
                        'Sec-Fetch-User': '?1',
                        'Upgrade-Insecure-Requests': '1',
                        'Referrer-Policy': 'strict-origin-when-cross-origin',
                        'Cookie': 'blockInfo={"901757778":{"version":61003,"heights":{"1":7585}}};'
                    }, responseType: 'text' }).then(response => {
                    if (response.data) {
                        stringData += cleanText(response.data);
                        blockCount++;
                    } else {
                        hasMoreBlocks = false;
                    }
                }).catch(error => {
                    if (error.response && (error.response.status === 404 || error.response.status === 400)) {
                        hasMoreBlocks = false;
                    } else {
                        throw error;
                    }
                }));
                blockIndex++;
            }

            await Promise.all(blockBatch); // ждем завершения запросов на 5 блоков перед следующим циклом
        }

        if (blockCount >= 3 && stringData) {
            await saveDataToFile(arbitr_id, stringData);
            console.log(`All blocks for document ${arbitr_id} have been combined and saved.`);
        } else {
            console.log(`Document ${arbitr_id} has less than 3 blocks and will not be saved.`);
        }
    } catch (error) {
        console.error(`Error fetching and saving document ${arbitr_id}:`, error);
    }
}



async function processDocumentsInBatch(batch) {
    const results = await Promise.all(batch.map(doc => fetchAndSaveDocumentAll(doc)));
    results.forEach((_, index) => console.log(`Документ ${batch[index]} обработан.`));
}



async function processDocuments() {
    const MAX_CONCURRENT_REQUESTS = 20;
    const documents = await getDocumentsToParse();
    console.log('всего номеров: ', documents.length);

    for (let i = 0; i < documents.length; i += MAX_CONCURRENT_REQUESTS) {
        const batch = documents.slice(i, i + MAX_CONCURRENT_REQUESTS);
        await processDocumentsInBatch(batch); // обрабатываем каждый пакет, прежде чем перейти к следующему
    }

    console.log("Все документы успешно обработаны.");
}


processDocuments()
