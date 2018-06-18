//
//  MainTabBarController.swift
//  AppleMusicRemake
//
//  Created by Kendall McCaskill on 6/17/18.
//  Copyright © 2018 Kendall McCaskill. All rights reserved.
//

import UIKit

class MainTabBarController: UITabBarController {
    
    override func viewDidLoad() {
        super.viewDidLoad()
        
        UINavigationBar.appearance().prefersLargeTitles = true
        
        tabBar.tintColor = .purple
    
    
        setupViewControllers()
    }
    
    //MARK:- Setup Functions
    fileprivate func setupViewControllers() {
        viewControllers = [generateNavigationController(with: MusicSearchController(), title: "Search", image: #imageLiteral(resourceName: "search")), generateNavigationController(with: ViewController(), title: "Favorites", image: #imageLiteral(resourceName: "favorites")), generateNavigationController(with: ViewController(), title: "Downloads", image: #imageLiteral(resourceName: "downloads"))]
    }
    
    //MARK:- Helper Functions
    
    fileprivate func generateNavigationController(with rootViewController: UIViewController, title: String, image: UIImage) -> UIViewController {
        let navController = UINavigationController(rootViewController: rootViewController)
        rootViewController.navigationItem.title = title
        navController.tabBarItem.title = title
        navController.tabBarItem.image = image
        
        return navController
    }
    
}
