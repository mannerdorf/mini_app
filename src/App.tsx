// ... (остальной код)

import { FormEvent, useEffect, useState, useCallback } from "react";
// Обновленный список импортов lucide-react:
import { 
    LogOut, Home, Truck, FileText, MessageCircle, User, Loader2, Check, X, Moon, Sun, Eye, EyeOff, AlertTriangle, Package, Calendar, Tag, Layers, Weight, Filter, Search, ChevronDown, User as UserIcon, Scale, List, Download, FileText as FileTextIcon, Send, 
    RussianRuble // <-- Добавлено вместо DollarSign
} from 'lucide-react'; 

// --- ТИПЫ ДАННЫХ ---
type AuthData = {
    login: string;
    password: string;
};

// ... (остальной код до CargoDetailsModal остается без изменений)

// ----------------- КОМПОНЕНТ ДЕТАЛИЗАЦИИ ГРУЗА (CargoDetailsModal) -----------------

type CargoDetailsModalProps = {
    item: CargoItem;
    isOpen: boolean;
    onClose: () => void;
    auth: AuthData; // Передаем данные авторизации для скачивания
};

function CargoDetailsModal({ item, isOpen, onClose, auth }: CargoDetailsModalProps) {
    
    const [downloading, setDownloading] = useState<string | null>(null); // 'ЭР', 'АПП', 'СЧЕТ', 'УПД'
    const [downloadError, setDownloadError] = useState<string | null>(null);

    if (!isOpen) return null;

    // Вспомогательная функция для отображения значения
    const renderValue = (value: number | string | undefined, unit: string = '') => {
        if (value === undefined || value === null || value === "") return '-';
        // Убираем дробную часть, если число целое
        const num = typeof value === 'string' ? parseFloat(value.replace(',', '.')) : value;
        if (!isNaN(num) && Math.floor(num) === num) {
            return `${Math.floor(num)}${unit ? ' ' + unit : ''}`;
        }
        return `${value}${unit ? ' ' + unit : ''}`;
    };

    // РЕАЛИЗАЦИЯ СКАЧИВАНИЯ ДОКУМЕНТОВ ЧЕРЕЗ ПРОКСИ (функция осталась прежней)
    const handleDownload = useCallback(async (docType: string) => {
        if (!item.Number) {
            alert("Невозможно скачать: отсутствует номер перевозки.");
            return;
        }

        setDownloading(docType);
        setDownloadError(null);
        
        try {
            // URL для прокси-эндпоинта, который должен обработать запрос к 1С
            const proxyUrl = PROXY_API_DOWNLOAD_URL; 

            const res = await fetch(proxyUrl, {
                method: "POST", 
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ 
                    login: auth.login, 
                    password: auth.password,
                    metod: docType,
                    number: item.Number
                }),
            });
            
            if (!res.ok) {
                let message = `Ошибка загрузки ${docType}: ${res.status}.`;
                try {
                     const errorText = await res.text();
                     message = `Ошибка загрузки ${docType}: ${res.status}. ${errorText}`;
                } catch { /* ignore */ }
                setDownloadError(message);
                return;
            }

            // Получаем BLOB-данные
            const blob = await res.blob();
            // Получаем Content-Type для определения расширения файла
            const contentType = res.headers.get('Content-Type') || 'application/octet-stream';
            
            let fileExtension = '';
            if (contentType.includes('application/pdf')) {
                fileExtension = 'pdf';
            } else if (contentType.includes('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') || contentType.includes('application/vnd.ms-excel')) {
                fileExtension = 'xlsx'; // Или xls
            } else if (contentType.includes('text/plain')) {
                fileExtension = 'txt';
            } else if (contentType.includes('text/xml')) {
                fileExtension = 'xml';
            } else {
                 // В случае, если тип не распознан, можно использовать 'bin' или 'pdf' по умолчанию
                 fileExtension = 'pdf'; 
            }

            // Создаем ссылку для скачивания
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${docType}_${item.Number}.${fileExtension}`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
            
            setDownloadError(null);
        } catch (e: any) {
            setDownloadError(e?.message || `Ошибка сети при скачивании ${docType}.`);
        } finally {
            setDownloading(null);
        }
    }, [item.Number, auth.login, auth.password]);
    
    // --- ЛОГИКА ДЛЯ НОВЫХ КНОПОК ---
    
    const handleChat = () => {
        // Заглушка: Открытие ссылки на поддержку в Telegram (предполагаем, что t.me/haulz_support - это наш контакт)
        const supportLink = 'https://t.me/haulz_support'; 
        
        // Telegram Web App API (если доступен)
        if ((window as any).Telegram && (window as any).Telegram.WebApp.openTelegramLink) {
            (window as any).Telegram.WebApp.openTelegramLink(supportLink);
        } else {
            window.open(supportLink, '_blank');
        }
    };
    
    const handleShare = () => {
        const shareText = `Перевозка №${item.Number || '-'}: Статус - ${item.State || 'Неизвестно'}, Сумма - ${formatCurrency(item.Sum)}.`;
        
        // В Telegram Web App для шаринга используется метод shareUrl
        if ((window as any).Telegram && (window as any).Telegram.WebApp.shareUrl) {
            // shareUrl требует URL для шаринга, но позволяет добавить текст
            // В качестве URL ставим заглушку (или URL вашего мини-приложения)
            const shareUrl = `${window.location.origin}/cargo/${item.Number}`; 
            (window as any).Telegram.WebApp.shareUrl(shareUrl, {
                text: shareText
            });
        } else {
            // Запасной вариант для обычного браузера: скопировать текст
            navigator.clipboard.writeText(shareText + ' (Ссылка на мини-приложение: ' + window.location.href + ')');
            alert(`Информация о перевозке скопирована в буфер обмена:\n\n${shareText}`);
        }
    };


    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h3 className="flex items-center">
                        <Truck className="w-5 h-5 mr-2 text-theme-primary" />
                        Перевозка №{item.Number || '-'}
                    </h3>
                    <button className="modal-close-button" onClick={onClose}>
                        <X className="w-6 h-6" />
                    </button>
                </div>
                
                {downloadError && <p className="login-error mb-4"><AlertTriangle className="w-5 h-5 mr-2" />{downloadError}</p>}
                
                {/* --- НОВЫЙ БЛОК: КНОПКИ ДЕЙСТВИЙ (из предыдущего шага) --- */}
                <div className="document-buttons mb-4">
                     <button 
                        className="doc-button" 
                        onClick={handleChat}
                    >
                        <MessageCircle className="w-4 h-4 mr-2" />
                        Написать в чате
                    </button>
                    <button 
                        className="doc-button" 
                        onClick={handleShare}
                    >
                        <Send className="w-4 h-4 mr-2" />
                        Отправить в мессенджерах
                    </button>
                </div>
                {/* --------------------------------------------------------- */}

                <div className="details-grid">
                    {/* Номер перевозки */}
                    <div className="details-item">
                        <div className="details-label">Номер перевозки</div>
                        <div className="details-value">{item.Number || '-'}</div>
                    </div>
                    {/* Статус */}
                    <div className="details-item">
                        <div className="details-label">Статус</div>
                        <div className={getStatusClass(item.State)}>{item.State || '-'}</div>
                    </div>
                    {/* Дата прихода */}
                    <div className="details-item">
                        <div className="details-label">Дата прихода</div>
                        <div className="details-value">{formatDate(item.DatePrih)}</div>
                    </div>
                    {/* Дата вручения */}
                    <div className="details-item">
                        <div className="details-label">Дата вручения</div>
                        <div className="details-value">{formatDate(item.DateVruch)}</div>
                    </div>
                    {/* Кол-во мест */}
                    <div className="details-item">
                        <div className="details-label">Кол-во мест</div>
                        <div className="details-value flex items-center"><Layers className="w-4 h-4 mr-1 text-theme-primary" />{renderValue(item.Mest)}</div>
                    </div>
                    {/* Платный вес */}
                    <div className="details-item">
                        <div className="details-label">Платный вес</div>
                        <div className="details-value flex items-center"><Scale className="w-4 h-4 mr-1 text-theme-primary" />{renderValue(item.PV, 'кг')}</div>
                    </div>
                    {/* Общий вес */}
                    <div className="details-item">
                        <div className="details-label">Общий вес</div>
                        <div className="details-value flex items-center"><Weight className="w-4 h-4 mr-1 text-theme-primary" />{renderValue(item.Weight, 'кг')}</div>
                    </div>
                    {/* Объем */}
                    <div className="details-item">
                        <div className="details-label">Объем</div>
                        <div className="details-value flex items-center"><List className="w-4 h-4 mr-1 text-theme-primary" />{renderValue(item.Volume, 'м³')}</div>
                    </div>
                    
                    {/* Стоимость: иконка DollarSign заменена на RussianRuble */}
                    <div className="details-item">
                        <div className="details-label">Стоимость</div>
                        <div className="details-value flex items-center">
                            <RussianRuble className="w-4 h-4 mr-1 text-theme-primary" /> {/* <-- Иконка Рубля */}
                            {formatCurrency(item.Sum)}
                        </div>
                    </div>
                    {/* Статус счета */}
                    <div className="details-item">
                        <div className="details-label">Статус счета</div>
                        <div className="details-value">{item.StatusSchet || '-'}</div>
                    </div>
                </div>

                <h4><FileTextIcon className="w-4 h-4 mr-2 inline-block text-theme-secondary" />Документы для скачивания</h4>
                <div className="document-buttons">
                    {['ЭР', 'АПП', 'СЧЕТ', 'УПД'].map((doc) => (
                         <button 
                            key={doc}
                            className="doc-button" 
                            onClick={() => handleDownload(doc)}
                            disabled={downloading === doc || !item.Number}
                        >
                            {downloading === doc ? (
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            ) : (
                                <Download className="w-4 h-4 mr-2" />
                            )}
                            {doc}
                        </button>
                    ))}
                </div>

            </div>
        </div>
    );
}
// ... (остальной код после CargoDetailsModal остается без изменений)
