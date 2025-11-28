if (!auth) {
    return (
        <div className="login-wrapper">
            <div className="login-card-new">
                
                {/* Тема (день/ночь) */}
                <button 
                    className="theme-toggle-fab" 
                    onClick={toggleTheme}
                    title={theme === 'dark' ? 'Светлая тема' : 'Темная тема'}
                >
                    {theme === 'dark' ? 
                        <Sun className="w-5 h-5" /> : 
                        <Moon className="w-5 h-5" />
                    }
                </button>

                {/* Логотип */}
                <div className="login-logo">HAULZ</div>
                <div className="login-subtitle">Доставка грузов в Калининград и обратно</div>

                {/* Форма */}
                <form onSubmit={handleLoginSubmit} className="login-form-modern">

                    {/* Логин */}
                    <div className="input-block-modern">
                        <input
                            type="text"
                            placeholder="Логин"
                            className="input-modern"
                            value={login}
                            onChange={(e) => setLogin(e.target.value)}
                        />
                    </div>

                    {/* Пароль */}
                    <div className="input-block-modern relative">
                        <input
                            type={showPassword ? "text" : "password"}
                            placeholder="Пароль"
                            className="input-modern"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                        <button
                            type="button"
                            className="password-eye-modern"
                            onClick={() => setShowPassword(!showPassword)}
                        >
                            {showPassword ? 
                                <EyeOff className="w-5 h-5" /> : 
                                <Eye className="w-5 h-5" />
                            }
                        </button>
                    </div>

                    {/* Кнопка */}
                    <button 
                        className="button-modern-primary"
                        type="submit"
                        disabled={loading}
                    >
                        {loading ? <Loader2 className="animate-spin w-5 h-5" /> : "Войти"}
                    </button>
                </form>

                {/* Ошибка */}
                {error && (
                    <div className="login-error-modern">
                        <AlertTriangle className="w-5 h-5 mr-2" />
                        {error}
                    </div>
                )}
            </div>
        </div>
    );
}
