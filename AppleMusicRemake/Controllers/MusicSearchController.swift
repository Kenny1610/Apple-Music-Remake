//
//  MusicSearchController.swift
//  AppleMusicRemake
//
//  Created by Kendall McCaskill on 6/17/18.
//  Copyright © 2018 Kendall McCaskill. All rights reserved.
//

import UIKit
import Alamofire

class MusicSearchController: UITableViewController, UISearchBarDelegate {
    
    var music = [Music]()
    
    let cellId = "cellId"
    
    // lets implement a UISearchController
    let searchController = UISearchController(searchResultsController: nil)
    
    override func viewDidLoad() {
        super.viewDidLoad()
        
        setupSearchBar()
       
        //1. Register cell for tableview
       setupTableView()
    }

    //MARK:- Setup Work
    
    fileprivate func setupSearchBar() {
        navigationItem.searchController = searchController
        navigationItem.hidesSearchBarWhenScrolling = false
        searchController.dimsBackgroundDuringPresentation = false
        searchController.searchBar.delegate = self
    }
    
    func searchBar(_ searchBar: UISearchBar, textDidChange searchText: String) {
        
        APIService.shared.fetchMusic(searchText: searchText) { (music) in
            self.music = music
            self.tableView.reloadData()
        }
    }
    
    //MARK:- UITableView
    
    fileprivate func setupTableView() {
        
        let nib = UINib(nibName: "MusicCell", bundle: nil)
        tableView.register(nib, forCellReuseIdentifier: cellId)
    }
    
    override func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int {
        return music.count
    }
    
    override func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
        let cell = tableView.dequeueReusableCell(withIdentifier: cellId, for: indexPath) as! MusicCell
        
        let music = self.music[indexPath.row]
        cell.music = music
        
//        let music = self.music[indexPath.row]
//        cell.textLabel?.text = "\(music.trackName ?? "")\n\(music.artistName ?? "")"
//        cell.textLabel?.numberOfLines = -1
//        cell.imageView?.image = #imageLiteral(resourceName: "appicon")
        
        return cell
    }
    
    override func tableView(_ tableView: UITableView, heightForRowAt indexPath: IndexPath) -> CGFloat {
        return 132
    }
}
