import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, doc, setDoc } from 'firebase/firestore';

// --- Firebase Initialization (Rule 1, 3) ---
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {
  // Dummy config to prevent crash if not provided in environment
  apiKey: "demo-key",
  projectId: "demo-project"
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'play-store-tracker';

// --- Icons (Inline SVGs) ---
const Icons = {
  Database: () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/></svg>,
  Table: () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><line x1="3" x2="21" y1="9" y2="9"/><line x1="3" x2="21" y1="15" y2="15"/><line x1="9" x2="9" y1="9" y2="21"/><line x1="15" x2="15" y1="9" y2="21"/></svg>,
  Activity: () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>,
  History: () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/></svg>,
  Download: () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>,
  Clipboard: () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>,
  TrendingUp: () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="green" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>,
  TrendingDown: () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="red" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/></svg>,
  Minus: () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="gray" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" x2="19" y1="12" y2="12"/></svg>
};

// --- Proxy Server Configuration ---
const PROXY_API_URL = typeof __proxy_api_url !== 'undefined'
  ? __proxy_api_url
  : 'http://localhost:3001';


export default function App() {
  const [user, setUser] = useState(null);
  const [history, setHistory] = useState([]);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [selectedSnapshot, setSelectedSnapshot] = useState(null);
  const [rankingType, setRankingType] = useState('all');

  // Custom Toast helper
  const showToast = (message, type = "info") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // --- Authentication ---
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Auth Error:", err);
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (usr) => {
      setUser(usr);
    });
    return () => unsubscribe();
  }, []);

  // --- Fetch Data from Firestore ---
  useEffect(() => {
    if (!user) return;

    setLoading(true);
    // Rule 1: Strict Paths -> artifacts/{appId}/users/{userId}/playStoreRankings
    const rankingsRef = collection(db, 'artifacts', appId, 'users', user.uid, 'playStoreRankings');
    
    // Rule 2: No complex queries. Fetch all and sort in memory.
    const unsubscribe = onSnapshot(rankingsRef, (snapshot) => {
      const docs = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          timestamp: data.timestamp,
          date: new Date(data.timestamp).toLocaleString('ko-KR'),
          type: data.type || 'all',
          rankings: JSON.parse(data.rankings)
        };
      });
      
      // Sort in memory by timestamp descending (newest first)
      docs.sort((a, b) => b.timestamp - a.timestamp);
      setHistory(docs);
      if (docs.length > 0 && !selectedSnapshot) {
         setSelectedSnapshot(docs[0]);
      }
      setLoading(false);
    }, (error) => {
      console.error("Firestore Listen Error:", error);
      setLoading(false);
      showToast("데이터를 불러오는데 실패했습니다.", "error");
    });

    return () => unsubscribe();
  }, [user, appId, selectedSnapshot]);

  // --- Fetch from Proxy Server & Save ---
  const handleFetchNewData = async () => {
    if (!user) return;

    const typeLabel = rankingType === 'games' ? '게임' : '전체 앱';
    showToast(`프록시 서버에서 ${typeLabel} 매출 순위를 수집 중입니다...`, "info");

    const suffix = rankingType === 'games' ? '/games' : '';
    const apiUrl = `${PROXY_API_URL}/api/rankings${suffix}`;

    try {
      const response = await fetch(apiUrl);
      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'API 요청 실패');
      }

      const newRankings = result.data;
      const sameTypeHistory = history.filter(h => h.type === rankingType);
      const previousRankings = sameTypeHistory.length > 0 ? sameTypeHistory[0].rankings : [];

      const rankingsWithChanges = newRankings.map(newApp => {
        const prevApp = previousRankings.find(p => p.name === newApp.name);
        const change = prevApp ? prevApp.rank - newApp.rank : 0;
        return { ...newApp, change };
      });

      const docId = `scrape_${Date.now()}`;
      const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'playStoreRankings', docId);

      await setDoc(docRef, {
        timestamp: Date.now(),
        type: rankingType,
        rankings: JSON.stringify(rankingsWithChanges)
      });

      showToast(`새로운 ${typeLabel} 순위 데이터가 적재되었습니다.`, "success");
      setActiveTab('table');
    } catch (err) {
      console.error(err);
      showToast(`데이터 수집 실패: ${err.message}`, "error");
    }
  };

  // --- Export Utilities ---
  const exportToCSV = (dataList, dateLabel) => {
    if (!dataList || dataList.length === 0) return;
    
    const headers = ["순위", "변동", "앱 이름", "퍼블리셔", "카테고리"];
    const rows = dataList.map(item => [
      item.rank,
      item.change,
      `"${item.name}"`, // Quote strings to handle commas
      `"${item.publisher}"`,
      item.category
    ].join(','));
    
    const csvContent = "\uFEFF" + [headers.join(','), ...rows].join('\n'); // Add BOM for Korean Excel compat
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `PlayStore_Top100_${dateLabel.replace(/[:\s]/g, '')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast("CSV 파일 다운로드가 시작되었습니다.", "success");
  };

  const exportToMarkdown = (dataList) => {
    if (!dataList || dataList.length === 0) return;
    
    let md = "| 순위 | 변동 | 앱 이름 | 퍼블리셔 | 카테고리 |\n";
    md += "|---|---|---|---|---|\n";
    
    dataList.forEach(item => {
      const changeStr = item.change > 0 ? `+${item.change}` : item.change < 0 ? `${item.change}` : '-';
      md += `| ${item.rank} | ${changeStr} | **${item.name}** | ${item.publisher} | ${item.category} |\n`;
    });

    const textArea = document.createElement("textarea");
    textArea.value = md;
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      showToast("마크다운 표가 클립보드에 복사되었습니다.", "success");
    } catch (err) {
      showToast("클립보드 복사에 실패했습니다.", "error");
    }
    document.body.removeChild(textArea);
  };

  // --- Dashboard Data Calcs ---
  const dashboardStats = useMemo(() => {
    if (history.length === 0) return null;
    const latest = history[0].rankings;
    
    // Find biggest risers
    const risers = [...latest].sort((a, b) => b.change - a.change).slice(0, 5);
    
    return {
      totalScrapes: history.length,
      currentNumberOne: latest[0].name,
      topRisers: risers
    };
  }, [history]);


  // --- Render Components ---

  const renderToast = () => {
    if (!toast) return null;
    const colors = {
      info: "bg-blue-600 text-white",
      success: "bg-green-600 text-white",
      error: "bg-red-600 text-white"
    };
    return (
      <div className={`fixed bottom-4 right-4 p-4 rounded-lg shadow-lg transition-all duration-300 z-50 ${colors[toast.type]}`}>
        {toast.message}
      </div>
    );
  };

  const renderDashboard = () => {
    if (loading) return <div className="text-center py-10">데이터 로딩 중...</div>;
    if (history.length === 0) return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-500">
        <Icons.Database />
        <p className="mt-4 text-lg">아직 적재된 데이터가 없습니다.</p>
        <p className="text-sm">우측 상단의 '데이터 스크래핑 실행' 버튼을 눌러보세요.</p>
      </div>
    );

    return (
      <div className="space-y-6 fade-in">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h3 className="text-sm font-medium text-gray-500">총 적재 데이터 수</h3>
            <p className="text-3xl font-bold text-gray-800 mt-2">{dashboardStats.totalScrapes} <span className="text-sm font-normal text-gray-400">회</span></p>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h3 className="text-sm font-medium text-gray-500">현재 매출 1위 앱</h3>
            <p className="text-2xl font-bold text-indigo-600 mt-2">{dashboardStats.currentNumberOne}</p>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h3 className="text-sm font-medium text-gray-500">마지막 업데이트</h3>
            <p className="text-lg font-bold text-gray-800 mt-2">{history[0].date}</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <Icons.TrendingUp /> 이전 대비 급상승 앱 TOP 5 (최신 데이터 기준)
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b bg-gray-50 text-sm text-gray-600">
                  <th className="p-3">순위</th>
                  <th className="p-3">앱 이름</th>
                  <th className="p-3">카테고리</th>
                  <th className="p-3">상승폭</th>
                </tr>
              </thead>
              <tbody>
                {dashboardStats.topRisers.map((app, idx) => (
                  <tr key={idx} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="p-3 font-semibold text-gray-800">{app.rank}</td>
                    <td className="p-3 font-medium">{app.name}</td>
                    <td className="p-3 text-sm text-gray-500">{app.category}</td>
                    <td className="p-3 text-green-600 font-bold flex items-center gap-1">
                      <Icons.TrendingUp /> {app.change} 계단
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  const renderTable = () => {
    if (loading) return <div className="text-center py-10">데이터 로딩 중...</div>;
    if (history.length === 0) return <div className="text-center py-10">데이터가 없습니다.</div>;

    const dataToDisplay = selectedSnapshot ? selectedSnapshot : history[0];

    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 fade-in flex flex-col h-[calc(100vh-180px)]">
        <div className="p-4 border-b flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-gray-50 rounded-t-xl">
          <div>
            <h2 className="text-lg font-bold text-gray-800">{dataToDisplay.type === 'games' ? '게임' : '전체 앱'} 매출 순위 (1~100위)</h2>
            <p className="text-sm text-gray-500">기준 일시: {dataToDisplay.date}</p>
          </div>
          <div className="flex gap-2">
            <a
              href={`${PROXY_API_URL}/api/rankings${dataToDisplay.type === 'games' ? '/games' : ''}/excel`}
              className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm font-medium hover:bg-green-100 transition-colors"
            >
              <Icons.Download /> 엑셀 다운로드
            </a>
            <button 
              onClick={() => exportToMarkdown(dataToDisplay.rankings)}
              className="flex items-center gap-2 px-3 py-2 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-lg text-sm font-medium hover:bg-indigo-100 transition-colors"
            >
              <Icons.Clipboard /> 마크다운 복사
            </button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-white shadow-sm z-10">
              <tr className="text-sm text-gray-600 border-b">
                <th className="p-4 w-20">순위</th>
                <th className="p-4 w-24 text-center">변동</th>
                <th className="p-4">앱 이름</th>
                <th className="p-4 hidden md:table-cell">퍼블리셔</th>
                <th className="p-4 hidden sm:table-cell">카테고리</th>
              </tr>
            </thead>
            <tbody>
              {dataToDisplay.rankings.map((app) => (
                <tr key={app.rank} className="border-b border-gray-100 hover:bg-indigo-50/50 transition-colors">
                  <td className="p-4 font-bold text-gray-800 text-lg">{app.rank}</td>
                  <td className="p-4 text-center">
                    {app.change > 0 ? (
                      <span className="flex items-center justify-center gap-1 text-green-600 text-sm font-semibold">
                        <Icons.TrendingUp /> {app.change}
                      </span>
                    ) : app.change < 0 ? (
                      <span className="flex items-center justify-center gap-1 text-red-500 text-sm font-semibold">
                        <Icons.TrendingDown /> {Math.abs(app.change)}
                      </span>
                    ) : (
                      <span className="flex items-center justify-center text-gray-400">
                        <Icons.Minus />
                      </span>
                    )}
                  </td>
                  <td className="p-4 font-semibold text-gray-900">{app.name}</td>
                  <td className="p-4 hidden md:table-cell text-sm text-gray-600">{app.publisher}</td>
                  <td className="p-4 hidden sm:table-cell">
                    <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded-md text-xs font-medium">
                      {app.category}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderHistory = () => {
    if (loading) return <div className="text-center py-10">데이터 로딩 중...</div>;
    if (history.length === 0) return <div className="text-center py-10">이력이 없습니다.</div>;

    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 fade-in p-6">
        <h2 className="text-lg font-bold text-gray-800 mb-6">데이터 적재 이력</h2>
        <div className="space-y-3">
          {history.map((record, index) => (
            <div 
              key={record.id} 
              className="flex items-center justify-between p-4 rounded-lg border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50 cursor-pointer transition-all"
              onClick={() => {
                setSelectedSnapshot(record);
                setActiveTab('table');
              }}
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold">
                  #{history.length - index}
                </div>
                <div>
                  <h4 className="font-semibold text-gray-800">{record.date} 적재본</h4>
                  <p className="text-sm text-gray-500">1~100위 {record.type === 'games' ? '게임' : '전체 앱'} 매출 순위</p>
                </div>
              </div>
              <button className="text-sm font-medium text-indigo-600 hover:text-indigo-800">
                자세히 보기 &rarr;
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-100 font-sans text-gray-900">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 text-indigo-600">
            <Icons.Activity />
            <h1 className="font-extrabold text-xl tracking-tight hidden sm:block">PlayRank Tracker</h1>
            <h1 className="font-extrabold text-xl tracking-tight sm:hidden">PR Tracker</h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex bg-gray-100 rounded-lg p-0.5">
              <button
                onClick={() => setRankingType('all')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${rankingType === 'all' ? 'bg-white shadow-sm text-indigo-700' : 'text-gray-500 hover:text-gray-700'}`}
              >
                전체 앱
              </button>
              <button
                onClick={() => setRankingType('games')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${rankingType === 'games' ? 'bg-white shadow-sm text-indigo-700' : 'text-gray-500 hover:text-gray-700'}`}
              >
                게임
              </button>
            </div>
            <button
              onClick={handleFetchNewData}
              disabled={loading || !user}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-semibold text-sm transition-colors disabled:opacity-50"
            >
              <Icons.Database /> <span className="hidden sm:inline">스크래핑</span><span className="sm:hidden">스크래핑</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 py-6">
        {/* Navigation Tabs */}
        <div className="flex space-x-1 bg-gray-200 p-1 rounded-xl mb-6 w-fit">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all ${activeTab === 'dashboard' ? 'bg-white shadow-sm text-indigo-700' : 'text-gray-600 hover:bg-gray-300'}`}
          >
            <Icons.Activity /> 대시보드
          </button>
          <button
            onClick={() => {
               setActiveTab('table');
               if (history.length > 0) setSelectedSnapshot(history[0]); // Reset to latest
            }}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all ${activeTab === 'table' ? 'bg-white shadow-sm text-indigo-700' : 'text-gray-600 hover:bg-gray-300'}`}
          >
            <Icons.Table /> 전체 순위표
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all ${activeTab === 'history' ? 'bg-white shadow-sm text-indigo-700' : 'text-gray-600 hover:bg-gray-300'}`}
          >
            <Icons.History /> 적재 히스토리
          </button>
        </div>

        {/* Dynamic Content Area */}
        <div className="w-full">
          {activeTab === 'dashboard' && renderDashboard()}
          {activeTab === 'table' && renderTable()}
          {activeTab === 'history' && renderHistory()}
        </div>

        {/* Architecture Info */}
        <div className="mt-8 p-4 bg-blue-50 text-blue-800 text-sm rounded-lg flex gap-3 items-start">
          <div className="mt-0.5"><Icons.Database /></div>
          <p>
            <strong>아키텍처:</strong> 이 웹 애플리케이션은 <code className="bg-blue-100 px-1 rounded">server/</code> 디렉토리의 Express 프록시 서버를 통해 Google Play Store 데이터를 스크래핑합니다.
            프론트엔드는 <code className="bg-blue-100 px-1 rounded">{PROXY_API_URL}/api/rankings</code> (전체 앱) 또는 <code className="bg-blue-100 px-1 rounded">{PROXY_API_URL}/api/rankings/games</code> (게임) 으로 요청하여 1~100위 매출 순위 데이터를 받아 Firebase에 저장합니다.
          </p>
        </div>
      </main>

      {renderToast()}

      <style dangerouslySetInnerHTML={{__html: `
        .fade-in {
          animation: fadeIn 0.3s ease-in-out;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(5px); }
          to { opacity: 1; transform: translateY(0); }
        }
        /* Custom scrollbar for the table */
        ::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        ::-webkit-scrollbar-track {
          background: #f1f1f1; 
        }
        ::-webkit-scrollbar-thumb {
          background: #c7c7cc; 
          border-radius: 4px;
        }
        ::-webkit-scrollbar-thumb:hover {
          background: #a1a1aa; 
        }
      `}} />
    </div>
  );
}